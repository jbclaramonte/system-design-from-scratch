import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UpdateProgress } from '../../shared/update'
import type { CommandRunner } from './commands'
import { UpdateError } from './errors'
import type { HelperPlan } from './helper'
import {
  APP_BUNDLE_ID,
  APP_BUNDLE_NAME,
  installUpdate,
  type InstallDeps,
  type InstallPlan
} from './installer'
import { dmgName } from './release'
import { fakeHttp, fakeRunner } from './testing/fakes'

const DMG_URL = 'http://127.0.0.1:9/files/' + dmgName('0.3.1')
const SUMS_URL = 'http://127.0.0.1:9/files/SHA256SUMS'
const digest = (content: string) => createHash('sha256').update(content).digest('hex')

let root: string
let tmpRoot: string
let apps: string
let plan: InstallPlan

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sdfs-installer-test-'))
  tmpRoot = join(root, 'tmp')
  apps = join(root, 'apps')
  await mkdir(tmpRoot)
  const bundle = join(apps, 'System Design from Scratch.app')
  await mkdir(join(bundle, 'Contents'), { recursive: true })
  await writeFile(join(bundle, 'Contents', 'marker'), 'installed')
  plan = {
    version: '0.3.1',
    bundlePath: bundle,
    executable: 'Contents/MacOS/System Design from Scratch',
    build: { dmgName: dmgName('0.3.1'), dmgUrl: DMG_URL, checksumsUrl: SUMS_URL }
  }
})

afterEach(() => rm(root, { recursive: true, force: true }))

const goodHttp = (content = 'dmg-bytes') =>
  fakeHttp({
    [DMG_URL]: content,
    [SUMS_URL]: `${digest('dmg-bytes')}  ${dmgName('0.3.1')}\n`
  })

interface Options {
  /** Commands to make fail, by executable name. */
  fail?: string[]
  plist?: Record<string, string>
  imageHasApp?: boolean
  http?: ReturnType<typeof fakeHttp>
  launchError?: Error
}

function setup({ fail = [], plist = {}, imageHasApp = true, http, launchError }: Options = {}) {
  const values: Record<string, string> = {
    CFBundleIdentifier: APP_BUNDLE_ID,
    CFBundleShortVersionString: '0.3.1',
    ...plist
  }
  const run = fakeRunner({
    hdiutil: async (args) => {
      if (fail.includes('hdiutil') && args[0] === 'attach')
        throw new Error('hdiutil: attach failed')
      if (args[0] === 'attach' && imageHasApp) {
        const mountPoint = args[args.indexOf('-mountpoint') + 1] as string
        await mkdir(join(mountPoint, APP_BUNDLE_NAME, 'Contents'), { recursive: true })
        await writeFile(join(mountPoint, APP_BUNDLE_NAME, 'Contents', 'marker'), 'new')
      }
    },
    ditto: async (args) => {
      if (fail.includes('ditto')) {
        // A copy that fails halfway leaves a partial folder behind.
        await mkdir(args[1] as string, { recursive: true })
        throw new Error('ditto: No space left on device')
      }
      await cp(args[0] as string, args[1] as string, { recursive: true })
    },
    codesign: () => {
      if (fail.includes('codesign')) throw new Error('code object is not signed at all')
    },
    plutil: (args) => values[args[1] as string]
  })
  const launched: HelperPlan[] = []
  const progress: UpdateProgress[] = []
  const deps: InstallDeps = {
    http: http ?? goodHttp(),
    run,
    tmpRoot,
    appPid: 4242,
    relaunchArgs: ['--user-data-dir=/scratch/data'],
    now: () => 1_000_000,
    onProgress: (p: UpdateProgress) => progress.push(p),
    launch: async (helperPlan: HelperPlan) => {
      if (launchError) throw launchError
      launched.push(helperPlan)
    }
  }
  return { run, launched, progress, deps }
}

/** Nothing of the attempt is left, and the installed app is as it was. */
async function expectUntouched() {
  expect(await readdir(tmpRoot)).toEqual([])
  expect((await readdir(apps)).sort()).toEqual(['System Design from Scratch.app'])
  expect(existsSync(join(plan.bundlePath, 'Contents', 'marker'))).toBe(true)
}

const commands = (run: { calls: { file: string; args: string[] }[] }) =>
  run.calls.map((call) => `${call.file} ${call.args[0]}`)

describe('installUpdate', () => {
  it('stages the new app next to the installed one and hands the swap to the helper', async () => {
    const { run, launched, progress, deps } = setup()
    await installUpdate(plan, deps)

    expect(launched).toHaveLength(1)
    const helper = launched[0] as HelperPlan
    expect(helper.appPid).toBe(4242)
    expect(helper.target).toBe(plan.bundlePath)
    // The relaunch keeps the app's switches (a custom --user-data-dir survives the update).
    expect(helper.executable).toBe('Contents/MacOS/System Design from Scratch')
    expect(helper.args).toEqual(['--user-data-dir=/scratch/data'])
    // Staged and backed up next to the target: the swap is a rename on one volume.
    expect(helper.staging.startsWith(apps)).toBe(true)
    expect(helper.backup.startsWith(apps)).toBe(true)
    expect(helper.work.startsWith(tmpRoot)).toBe(true)
    expect(existsSync(join(helper.staging, 'Contents', 'marker'))).toBe(true)
    // The installed app is not touched before the helper runs; the image is gone.
    expect(existsSync(join(plan.bundlePath, 'Contents', 'marker'))).toBe(true)
    expect(existsSync(join(helper.work, dmgName('0.3.1')))).toBe(false)

    expect(commands(run)).toEqual([
      'hdiutil attach',
      'ditto ' + join(helper.work, 'mount', APP_BUNDLE_NAME),
      'hdiutil detach',
      'codesign --verify',
      'plutil -extract',
      'plutil -extract'
    ])
    expect(run.calls[0]?.args).toEqual(
      expect.arrayContaining(['-readonly', '-nobrowse', '-mountpoint'])
    )
    expect(run.calls[3]?.args).toEqual(['--verify', '--deep', '--strict', helper.staging])
    expect(progress.map((p) => p.phase)).toEqual([
      'downloading',
      'downloading',
      'verifying',
      'preparing',
      'restarting'
    ])
  })

  it('refuses a corrupt download before mounting anything', async () => {
    const { run, launched, deps } = setup({ http: goodHttp('tampered-bytes') })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'checksum' })
    expect(run.calls).toEqual([])
    expect(launched).toEqual([])
    await expectUntouched()
  })

  it('refuses a release whose checksums do not list the image', async () => {
    const http = fakeHttp({
      [DMG_URL]: 'dmg-bytes',
      [SUMS_URL]: `${digest('dmg-bytes')}  other.dmg\n`
    })
    await expect(installUpdate(plan, setup({ http }).deps)).rejects.toMatchObject({
      code: 'checksum'
    })
    await expectUntouched()
  })

  it('leaves the installed app untouched when the download fails', async () => {
    const http = fakeHttp({ [DMG_URL]: new UpdateError('network', 'offline'), [SUMS_URL]: '' })
    const { launched, deps } = setup({ http })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({
      code: 'network',
      message: 'offline'
    })
    expect(launched).toEqual([])
    await expectUntouched()
  })

  it('leaves the installed app untouched, and removes the partial copy, when the copy fails', async () => {
    const { run, launched, deps } = setup({ fail: ['ditto'] })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({
      code: 'copy',
      message: expect.stringContaining('copied')
    })
    expect(launched).toEqual([])
    // The image is unmounted again.
    expect(commands(run).filter((call) => call === 'hdiutil detach')).toHaveLength(1)
    await expectUntouched()
  })

  it('leaves the installed app untouched when the signature check fails', async () => {
    const { launched, deps } = setup({ fail: ['codesign'] })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'signature' })
    expect(launched).toEqual([])
    await expectUntouched()
  })

  it('refuses an image that holds another version or another app', async () => {
    const variants: Record<string, string>[] = [
      { CFBundleShortVersionString: '0.3.0' },
      { CFBundleIdentifier: 'com.example.other' }
    ]
    for (const plist of variants) {
      const { launched, deps } = setup({ plist })
      await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'wrong_app' })
      expect(launched).toEqual([])
      await expectUntouched()
    }
  })

  it('refuses an image without the app', async () => {
    const { run, deps } = setup({ imageHasApp: false })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'wrong_app' })
    expect(commands(run)).toContain('hdiutil detach')
    await expectUntouched()
  })

  it('reports an image that cannot be mounted', async () => {
    const { run, deps } = setup({ fail: ['hdiutil'] })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'mount' })
    // Never mounted: nothing to unmount.
    expect(commands(run)).toEqual(['hdiutil attach'])
    await expectUntouched()
  })

  it('removes the staged copy when the helper cannot start', async () => {
    const { deps } = setup({ launchError: new UpdateError('helper', 'no helper') })
    await expect(installUpdate(plan, deps)).rejects.toMatchObject({ code: 'helper' })
    await expectUntouched()
  })

  it('detaches by force when a plain detach fails', async () => {
    const { run, deps } = setup({ fail: ['ditto'] })
    let detaches = 0
    const flaky: CommandRunner = async (file, args, options) => {
      if (file === 'hdiutil' && args[0] === 'detach' && detaches++ === 0) {
        throw new Error('resource busy')
      }
      return run(file, args, options)
    }
    await expect(installUpdate(plan, { ...deps, run: flaky })).rejects.toMatchObject({
      code: 'copy'
    })
    expect(run.calls.some((call) => call.args.includes('-force'))).toBe(true)
  })
})
