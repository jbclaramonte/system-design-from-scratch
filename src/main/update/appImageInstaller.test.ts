import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UpdateProgress } from '../../shared/update'
import type { AppImageHelperPlan } from './appImageHelper'
import {
  installAppImageUpdate,
  type AppImageInstallDeps,
  type AppImageFileOps,
  type AppImagePlan
} from './appImageInstaller'
import { UpdateError } from './errors'
import { appImageName } from './release'
import { fakeHttp } from './testing/fakes'

const IMAGE_URL = `http://127.0.0.1:9/files/${appImageName('0.3.1')}`
const SUMS_URL = 'http://127.0.0.1:9/files/SHA256SUMS'
const digest = (content: string) => createHash('sha256').update(content).digest('hex')
const NEW_IMAGE = '#!/bin/bash\necho new-version\n'

let root: string
let tmpRoot: string
let installedDir: string
let installed: string
let plan: AppImagePlan
const children: ChildProcess[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sdfs-appimage-installer-test-'))
  tmpRoot = join(root, 'tmp')
  installedDir = join(root, 'apps')
  installed = join(installedDir, 'system-design-from-scratch.AppImage')
  await mkdir(tmpRoot)
  await mkdir(installedDir)
  await writeFile(installed, 'old-version', { mode: 0o755 })
  plan = {
    version: '0.3.1',
    appImagePath: installed,
    build: {
      appImageName: appImageName('0.3.1'),
      appImageUrl: IMAGE_URL,
      checksumsUrl: SUMS_URL
    }
  }
})

afterEach(async () => {
  for (const child of children) child.kill('SIGKILL')
  children.length = 0
  await chmod(installedDir, 0o755).catch(() => {})
  await rm(root, { recursive: true, force: true })
})

const goodHttp = (content = NEW_IMAGE) =>
  fakeHttp({
    [IMAGE_URL]: content,
    [SUMS_URL]: `${digest(NEW_IMAGE)}  ${appImageName('0.3.1')}\n`
  })

interface Options {
  http?: ReturnType<typeof fakeHttp>
  files?: Partial<AppImageFileOps>
  launchError?: Error
}

function setup({ http, files, launchError }: Options = {}) {
  const progress: UpdateProgress[] = []
  const launched: AppImageHelperPlan[] = []
  const cancelled: number[] = []
  const deps: AppImageInstallDeps = {
    http: http ?? goodHttp(),
    files: files && {
      chmod: files.chmod ?? ((path, mode) => chmod(path, mode)),
      rename: files.rename ?? ((from, to) => rename(from, to))
    },
    launch: (helperPlan) => {
      if (launchError) return Promise.reject(launchError)
      launched.push(helperPlan)
      return Promise.resolve({ cancel: () => void cancelled.push(launched.length) })
    },
    onProgress: (value) => progress.push(value),
    tmpRoot,
    appPid: 4242,
    relaunchArgs: ['--user-data-dir=/scratch/my data', '--flag'],
    relaunchEnv: { SDFS_TEST_ENV: 'kept' },
    startDir: '/home/me',
    now: (() => {
      let time = 0
      return () => (time += 1000)
    })()
  }
  return { deps, progress, launched, cancelled }
}

const installedContent = () => readFile(installed, 'utf8')
/** Nothing of an attempt is left: no staged file next to the AppImage, no helper folder. */
async function expectNothingLeft() {
  expect(await readdir(installedDir)).toEqual([installed.split('/').pop()])
  expect(await readdir(tmpRoot)).toEqual([])
}

describe('installAppImageUpdate', () => {
  it('replaces the running file with the verified new one, executable, and hands over to the helper', async () => {
    const { deps, progress, launched } = setup()
    await installAppImageUpdate(plan, deps)

    expect(await installedContent()).toBe(NEW_IMAGE)
    expect((await stat(installed)).mode & 0o777).toBe(0o755)
    expect(await readdir(installedDir)).toEqual(['system-design-from-scratch.AppImage'])
    expect(progress.map((step) => step.phase)).toEqual([
      'downloading',
      'downloading',
      'verifying',
      'preparing',
      'restarting'
    ])
    expect(launched).toHaveLength(1)
    expect(launched[0]).toMatchObject({ appPid: 4242, target: installed })
  })

  it('writes the new file next to the running one (same folder: the rename is atomic)', async () => {
    const renames: Array<[string, string]> = []
    const { deps } = setup({
      files: {
        rename: async (from, to) => {
          renames.push([from, to])
          await rename(from, to)
        }
      }
    })
    await installAppImageUpdate(plan, deps)
    expect(renames).toHaveLength(1)
    expect(renames[0]?.[0].startsWith(`${installedDir}/.sdfs-update-`)).toBe(true)
    expect(renames[0]?.[1]).toBe(installed)
  })

  it('gives the relaunch the arguments, the environment and the start folder of the running app', async () => {
    const { deps, launched } = setup()
    await installAppImageUpdate(plan, deps)
    expect(launched[0]?.args).toEqual(['--user-data-dir=/scratch/my data', '--flag'])
    expect(launched[0]?.env).toEqual({ SDFS_TEST_ENV: 'kept' })
    expect(launched[0]?.startDir).toBe('/home/me')
  })

  it('fails with the checksum message on a corrupt download, the installed file untouched', async () => {
    const { deps, launched } = setup({ http: goodHttp('corrupt bytes') })
    await expect(installAppImageUpdate(plan, deps)).rejects.toMatchObject({ code: 'checksum' })
    expect(await installedContent()).toBe('old-version')
    expect(launched).toHaveLength(0)
    await expectNothingLeft()
  })

  it('fails when SHA256SUMS does not list the AppImage', async () => {
    const http = fakeHttp({
      [IMAGE_URL]: NEW_IMAGE,
      [SUMS_URL]: `${digest('x')}  other.AppImage\n`
    })
    await expect(installAppImageUpdate(plan, setup({ http }).deps)).rejects.toMatchObject({
      code: 'checksum'
    })
    expect(await installedContent()).toBe('old-version')
    await expectNothingLeft()
  })

  it('fails on a failing download or checksum file, the installed file untouched', async () => {
    for (const files of [
      { [SUMS_URL]: `${digest(NEW_IMAGE)}  ${appImageName('0.3.1')}\n` },
      { [IMAGE_URL]: NEW_IMAGE }
    ]) {
      const http = fakeHttp(files)
      await expect(installAppImageUpdate(plan, setup({ http }).deps)).rejects.toMatchObject({
        code: 'network'
      })
      expect(await installedContent()).toBe('old-version')
      await expectNothingLeft()
    }
    const broken = fakeHttp({
      [IMAGE_URL]: new UpdateError('network', 'The download was interrupted before the end.'),
      [SUMS_URL]: ''
    })
    await expect(installAppImageUpdate(plan, setup({ http: broken }).deps)).rejects.toThrow(
      'interrupted'
    )
    expect(await installedContent()).toBe('old-version')
  })

  it.skipIf(process.getuid?.() === 0)(
    'fails with a readable message when the folder is not writable, the installed file untouched',
    async () => {
      await chmod(installedDir, 0o555)
      const { deps, launched } = setup()
      const error = await installAppImageUpdate(plan, deps).catch((reason: unknown) => reason)
      expect(error).toBeInstanceOf(UpdateError)
      expect(error).toMatchObject({ code: 'copy' })
      expect((error as Error).message).toContain(installedDir)
      expect(await installedContent()).toBe('old-version')
      expect(launched).toHaveLength(0)
      expect(await readdir(tmpRoot)).toEqual([])
    }
  )

  it('leaves the installed file untouched when the chmod fails', async () => {
    const { deps } = setup({
      files: { chmod: () => Promise.reject(new Error('EPERM')) }
    })
    await expect(installAppImageUpdate(plan, deps)).rejects.toMatchObject({ code: 'copy' })
    expect(await installedContent()).toBe('old-version')
    await expectNothingLeft()
  })

  it('leaves the installed file untouched, and stops the helper, when the rename fails', async () => {
    const { deps, launched, cancelled } = setup({
      files: { rename: () => Promise.reject(new Error('EXDEV')) }
    })
    await expect(installAppImageUpdate(plan, deps)).rejects.toMatchObject({ code: 'copy' })
    expect(launched).toHaveLength(1)
    expect(cancelled).toEqual([1])
    expect(await installedContent()).toBe('old-version')
    await expectNothingLeft()
  })

  it('replaces nothing when the helper cannot be started', async () => {
    const { deps } = setup({ launchError: new UpdateError('helper', 'no helper') })
    await expect(installAppImageUpdate(plan, deps)).rejects.toMatchObject({ code: 'helper' })
    expect(await installedContent()).toBe('old-version')
    await expectNothingLeft()
  })
})

describe('installAppImageUpdate with the real relaunch helper', () => {
  it('replaces the file, then relaunches the new one with the arguments and environment once the app quits', async () => {
    const app = spawn('sleep', ['30'], { stdio: 'ignore' })
    children.push(app)
    const fresh = `#!/bin/bash\necho "new $* env=$SDFS_TEST_ENV appimage=\${APPIMAGE-unset}" >> "${root}/launch.log"\n`
    const sums = `${digest(fresh)}  ${appImageName('0.3.1')}\n`
    const { deps } = setup({ http: fakeHttp({ [IMAGE_URL]: fresh, [SUMS_URL]: sums }) })
    delete deps.launch
    deps.appPid = app.pid as number
    deps.relaunchEnv = { PATH: process.env.PATH, SDFS_TEST_ENV: 'kept' }
    deps.startDir = root

    await installAppImageUpdate(plan, deps)
    expect(await installedContent()).toBe(fresh)
    // The app is still running: nothing has been relaunched yet.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(existsSync(join(root, 'launch.log'))).toBe(false)

    app.kill('SIGKILL')
    let line = ''
    for (let i = 0; i < 100 && !line; i++) {
      line = existsSync(join(root, 'launch.log'))
        ? await readFile(join(root, 'launch.log'), 'utf8')
        : ''
      if (!line) await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(line).toBe('new --user-data-dir=/scratch/my data --flag env=kept appimage=unset\n')
  })
})
