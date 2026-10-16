// Installs a release over the running AppImage, with the same steps as install.sh on Linux: download
// the .AppImage and SHA256SUMS, check the checksum, make the file executable, then replace the
// running file with a rename. The new file is written next to the running one (same folder, hence
// one volume, so the rename is atomic) and the running instance keeps the old inode, so replacing
// the file under it is safe. A detached helper (appImageHelper.ts) relaunches the new AppImage once
// the app has quit. Every step before the rename leaves the installed file untouched; a failure
// removes what was created.
import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { UpdateProgress } from '../../shared/update'
import { launchAppImageHelper, type AppImageHelperPlan, type HelperHandle } from './appImageHelper'
import { verifyChecksum } from './checksum'
import { UpdateError } from './errors'
import type { HttpClient } from './http'
import type { LinuxBuild } from './release'

export interface AppImagePlan {
  version: string
  build: LinuxBuild
  /** The running `.AppImage` file (`APPIMAGE`, symbolic links resolved), replaced by the new one. */
  appImagePath: string
}

/** The disk operations of the swap, injectable to make each one fail in tests. */
export interface AppImageFileOps {
  chmod: (path: string, mode: number) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
}

export interface AppImageInstallDeps {
  http: HttpClient
  files?: AppImageFileOps
  /** Starts the detached relaunch helper; the real one by default. */
  launch?: (plan: AppImageHelperPlan) => Promise<HelperHandle>
  onProgress?: (progress: UpdateProgress) => void
  /** Where the helper script and its log go. Default: the OS temporary folder. */
  tmpRoot: string
  /** The app's process id, which the helper waits for. */
  appPid: number
  /** The command-line arguments of the running app, given to the relaunched one. */
  relaunchArgs: string[]
  /** The environment of the running app, given to the relaunched one (`relaunchEnvironment`). */
  relaunchEnv: NodeJS.ProcessEnv
  /** The folder the running app was started in, where the relaunched one starts. */
  startDir: string
  now?: () => number
}

const PROGRESS_INTERVAL_MS = 250
const realFiles: AppImageFileOps = { chmod, rename }

/**
 * Downloads, checks and stages the release, replaces the running AppImage and starts the helper
 * that relaunches it after the app quits. Resolves once that is done: the caller then quits the
 * app. Rejects with an `UpdateError`; the installed file is then untouched and nothing remains of
 * the attempt.
 */
export async function installAppImageUpdate(
  plan: AppImagePlan,
  deps: AppImageInstallDeps
): Promise<void> {
  const files = deps.files ?? realFiles
  const launch = deps.launch ?? launchAppImageHelper
  const now = deps.now ?? Date.now
  const progress = deps.onProgress ?? (() => {})
  const folder = dirname(plan.appImagePath)
  const staging = join(folder, `.sdfs-update-${randomUUID().slice(0, 8)}.AppImage`)

  let work: string | undefined
  let helper: HelperHandle | undefined
  try {
    let lastProgress = 0
    progress({ phase: 'downloading', receivedBytes: 0, totalBytes: null })
    try {
      await deps.http.download(plan.build.appImageUrl, staging, (received, total) => {
        const time = now()
        if (time - lastProgress < PROGRESS_INTERVAL_MS) return
        lastProgress = time
        progress({ phase: 'downloading', receivedBytes: received, totalBytes: total })
      })
    } catch (error) {
      if (error instanceof UpdateError) throw error
      throw new UpdateError(
        'copy',
        `The new version could not be written next to the app in ${folder} (disk full, or the folder is not writable).`,
        { cause: error }
      )
    }
    const sums = await deps.http.getText(plan.build.checksumsUrl)

    progress({ phase: 'verifying' })
    await verifyChecksum(staging, plan.build.appImageName, sums)

    progress({ phase: 'preparing' })
    try {
      await files.chmod(staging, 0o755)
    } catch (error) {
      throw new UpdateError('copy', 'The new version could not be made executable.', {
        cause: error
      })
    }

    // The helper starts first: when it cannot, nothing has been replaced yet. It only waits until
    // the app quits, so it is stopped if the swap fails below.
    work = await mkdtemp(join(deps.tmpRoot, 'sdfs-update-'))
    helper = await launch({
      appPid: deps.appPid,
      target: plan.appImagePath,
      work,
      log: join(deps.tmpRoot, 'sdfs-update.log'),
      startDir: deps.startDir,
      args: deps.relaunchArgs,
      env: deps.relaunchEnv
    })

    progress({ phase: 'restarting' })
    try {
      // The commit point: atomic, and the running instance keeps its old inode.
      await files.rename(staging, plan.appImagePath)
    } catch (error) {
      throw new UpdateError(
        'copy',
        `The new version could not replace the running file in ${folder}.`,
        { cause: error }
      )
    }
  } catch (error) {
    helper?.cancel()
    await rm(staging, { force: true })
    if (work) await rm(work, { recursive: true, force: true })
    throw error instanceof UpdateError
      ? error
      : new UpdateError('unknown', 'The update failed unexpectedly.', { cause: error })
  }
}
