// Installs a release over the running app bundle, with the same steps as install.sh: download the
// .dmg and SHA256SUMS, check the checksum, mount the image read-only, copy the app next to the
// target, check its signature and identity, then hand the swap to a detached helper (helper.ts).
// Every step before the hand-off leaves the installed app untouched; a failure removes what was
// created.
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UpdateProgress } from '../../shared/update'
import { verifyChecksum } from './checksum'
import { runCommand, type CommandRunner } from './commands'
import { UpdateError } from './errors'
import { launchHelper, type HelperPlan } from './helper'
import type { HttpClient } from './http'
import type { MacBuild } from './release'

/** The bundle inside the .dmg (electron-builder `productName`). */
export const APP_BUNDLE_NAME = 'System Design from Scratch.app'
/** electron-builder `appId`: the new bundle must be this app. */
export const APP_BUNDLE_ID = 'com.jbclaramonte.system-design-from-scratch'

export interface InstallDeps {
  http: HttpClient
  run?: CommandRunner
  /** Starts the detached swap helper; the real one by default. */
  launch?: (plan: HelperPlan) => Promise<void>
  onProgress?: (progress: UpdateProgress) => void
  /** Where the temporary folder and the helper log go. Default: the OS temporary folder. */
  tmpRoot: string
  /** The app's process id, which the helper waits for. */
  appPid: number
  /** The command-line arguments of the running app, given to the relaunched one. */
  relaunchArgs: string[]
  now?: () => number
}

export interface InstallPlan {
  version: string
  build: MacBuild
  /** The running bundle, replaced by the new one. */
  bundlePath: string
  /** The running binary, relative to the bundle: what the helper relaunches. */
  executable: string
}

const PROGRESS_INTERVAL_MS = 250

async function readPlist(run: CommandRunner, plist: string, key: string): Promise<string> {
  const { stdout } = await run('plutil', ['-extract', key, 'raw', '-o', '-', plist])
  return stdout.trim()
}

/**
 * Downloads, checks and stages the release, then starts the helper that swaps the bundle after the
 * app quits. Resolves once the helper runs: the caller then quits the app. Rejects with an
 * `UpdateError`; nothing remains of the attempt and the installed app is untouched.
 */
export async function installUpdate(plan: InstallPlan, deps: InstallDeps): Promise<void> {
  const run = deps.run ?? runCommand
  const launch = deps.launch ?? launchHelper
  const now = deps.now ?? Date.now
  const progress = deps.onProgress ?? (() => {})
  const folder = dirname(plan.bundlePath)
  const id = randomUUID().slice(0, 8)
  const staging = join(folder, `.sdfs-update-${id}.app`)

  const work = await mkdtemp(join(deps.tmpRoot, 'sdfs-update-'))
  const mountPoint = join(work, 'mount')
  let mounted = false
  const detach = async () => {
    if (!mounted) return
    mounted = false
    try {
      await run('hdiutil', ['detach', mountPoint, '-quiet'])
    } catch {
      await run('hdiutil', ['detach', mountPoint, '-force', '-quiet']).catch(() => {})
    }
  }

  try {
    const dmg = join(work, plan.build.dmgName)
    let lastProgress = 0
    progress({ phase: 'downloading', receivedBytes: 0, totalBytes: null })
    await deps.http.download(plan.build.dmgUrl, dmg, (received, total) => {
      const time = now()
      if (time - lastProgress < PROGRESS_INTERVAL_MS) return
      lastProgress = time
      progress({ phase: 'downloading', receivedBytes: received, totalBytes: total })
    })
    const sums = await deps.http.getText(plan.build.checksumsUrl)

    progress({ phase: 'verifying' })
    await verifyChecksum(dmg, plan.build.dmgName, sums)

    progress({ phase: 'preparing' })
    await mkdir(mountPoint)
    try {
      await run(
        'hdiutil',
        ['attach', '-readonly', '-nobrowse', '-noverify', '-quiet', '-mountpoint', mountPoint, dmg],
        { timeoutMs: 120_000 }
      )
    } catch (error) {
      throw new UpdateError('mount', 'The downloaded update image could not be opened.', {
        cause: error
      })
    }
    mounted = true

    const source = join(mountPoint, APP_BUNDLE_NAME)
    if (
      !(await stat(source).then(
        (info) => info.isDirectory(),
        () => false
      ))
    ) {
      throw new UpdateError('wrong_app', `The update image does not contain ${APP_BUNDLE_NAME}.`)
    }
    try {
      // Next to the target (same volume): the swap is a rename, never a half-copied app.
      await run('ditto', [source, staging], { timeoutMs: 300_000 })
    } catch (error) {
      throw new UpdateError(
        'copy',
        `The new version could not be copied next to the app in ${folder} (disk full, or the folder is not writable).`,
        { cause: error }
      )
    }
    await detach()

    try {
      await run('codesign', ['--verify', '--deep', '--strict', staging])
    } catch (error) {
      throw new UpdateError('signature', 'The new version has an invalid signature.', {
        cause: error
      })
    }
    const plist = join(staging, 'Contents', 'Info.plist')
    const [bundleId, bundleVersion] = await Promise.all([
      readPlist(run, plist, 'CFBundleIdentifier'),
      readPlist(run, plist, 'CFBundleShortVersionString')
    ]).catch((error: unknown) => {
      throw new UpdateError('wrong_app', 'The new version cannot be identified.', { cause: error })
    })
    if (bundleId !== APP_BUNDLE_ID || bundleVersion !== plan.version) {
      throw new UpdateError(
        'wrong_app',
        `The update image holds version ${bundleVersion || 'unknown'} of ${bundleId || 'another app'}, not version ${plan.version} of this app.`
      )
    }

    // The image is not needed any more: free its space before the swap.
    await rm(dmg, { force: true })
    progress({ phase: 'restarting' })
    await launch({
      appPid: deps.appPid,
      target: plan.bundlePath,
      executable: plan.executable,
      args: deps.relaunchArgs,
      staging,
      backup: join(folder, `.sdfs-old-${id}.app`),
      work,
      log: join(deps.tmpRoot, 'sdfs-update.log')
    })
  } catch (error) {
    await detach()
    await rm(staging, { recursive: true, force: true })
    await rm(work, { recursive: true, force: true })
    throw error instanceof UpdateError
      ? error
      : new UpdateError('unknown', 'The update failed unexpectedly.', { cause: error })
  }
}
