// Runs the real relaunch script (bash) in scratch folders, with a fake AppImage.
import { spawn, type ChildProcess } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  launchAppImageHelper,
  relaunchEnvironment,
  type AppImageHelperPlan
} from './appImageHelper'

let root: string
let plan: AppImageHelperPlan
const children: ChildProcess[] = []

const read = (path: string) => readFile(path, 'utf8')

/** An "AppImage" that logs its version, its arguments, its folder and one environment variable. */
async function makeAppImage(path: string, version: string) {
  await writeFile(
    path,
    `#!/bin/bash\necho "${version} $* env=$SDFS_TEST_ENV appdir=\${APPDIR-unset} cwd=$(pwd -P)" >> "${root}/launch.log"\n`
  )
  await chmod(path, 0o755)
}

/** The relaunch runs in the background: waits for its line in the log. */
async function launchLog(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(join(root, 'launch.log'))) return read(join(root, 'launch.log'))
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('the app was not relaunched')
}

/** The pid of a process that has already exited: the app, once quit. */
async function exitedPid(): Promise<number> {
  const child = spawn('true', [], { stdio: 'ignore' })
  await new Promise((resolve) => child.once('exit', resolve))
  return child.pid as number
}

/** A process that runs for `seconds`, standing for the app. */
function fakeApp(seconds: number): number {
  const child = spawn('sleep', [String(seconds)], { stdio: 'ignore' })
  children.push(child)
  return child.pid as number
}

/** Runs the helper attached (not detached) and resolves when it exits. */
async function runHelper(): Promise<number | null> {
  let helper: ChildProcess | undefined
  await launchAppImageHelper(plan, (file, args, options) => {
    helper = spawn(file, args, { ...options, detached: false })
    children.push(helper)
    return helper
  })
  return new Promise((resolve) => helper?.once('exit', resolve))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sdfs-appimage-helper-test-'))
  await mkdir(join(root, 'work'))
  await mkdir(join(root, 'start dir'))
  await makeAppImage(join(root, 'app.AppImage'), 'new')
  plan = {
    appPid: await exitedPid(),
    target: join(root, 'app.AppImage'),
    work: join(root, 'work'),
    log: join(root, 'helper.log'),
    startDir: join(root, 'start dir'),
    args: ['--user-data-dir=/scratch/my data', '--flag'],
    env: { PATH: process.env.PATH, SDFS_TEST_ENV: 'kept' },
    waitSeconds: 5
  }
})

afterEach(async () => {
  for (const child of children) child.kill('SIGKILL')
  children.length = 0
  await rm(root, { recursive: true, force: true })
})

describe('the AppImage relaunch helper', () => {
  it('waits for the app to quit, relaunches the new file with its arguments and environment, and cleans up', async () => {
    plan.appPid = fakeApp(0.6)
    const started = Date.now()
    expect(await runHelper()).toBe(0)

    expect(Date.now() - started).toBeGreaterThanOrEqual(400)
    const line = await launchLog()
    expect(line).toContain('new --user-data-dir=/scratch/my data --flag env=kept')
    // Started in the folder the app was started in.
    expect(line).toContain('start dir')
    expect(existsSync(plan.work)).toBe(false)
    expect(await read(plan.log)).toContain('relaunched')
  })

  it('relaunches with no arguments at all', async () => {
    plan.args = []
    await runHelper()
    expect(await launchLog()).toMatch(/^new {2}env=kept/)
  })

  it('starts in / when the start folder is gone', async () => {
    plan.startDir = join(root, 'gone')
    await runHelper()
    expect(await launchLog()).toMatch(/cwd=\/(\n|$)/)
  })

  it('gives up without relaunching when the app does not quit in time', async () => {
    plan.appPid = fakeApp(30)
    plan.waitSeconds = 1
    expect(await runHelper()).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(existsSync(join(root, 'launch.log'))).toBe(false)
    expect(await read(plan.log)).toContain('did not quit in time')
    expect(existsSync(plan.work)).toBe(false)
  })

  it('logs a relaunch that cannot start when the file is not executable', async () => {
    await chmod(plan.target, 0o644)
    expect(await runHelper()).toBe(0)
    expect(await read(plan.log)).toContain('not executable')
    expect(existsSync(join(root, 'launch.log'))).toBe(false)
  })

  it('can be cancelled before the app quits', async () => {
    plan.appPid = fakeApp(30)
    let helper: ChildProcess | undefined
    const handle = await launchAppImageHelper(plan, (file, args, options) => {
      helper = spawn(file, args, { ...options, detached: false })
      children.push(helper)
      return helper
    })
    const exited = new Promise((resolve) => helper?.once('exit', resolve))
    handle.cancel()
    await exited
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(existsSync(join(root, 'launch.log'))).toBe(false)
  })

  it('reports a helper that cannot be started', async () => {
    await expect(
      launchAppImageHelper(plan, () => {
        throw new Error('spawn failed')
      })
    ).rejects.toMatchObject({ code: 'helper' })
    await expect(
      launchAppImageHelper(plan, () => ({ pid: undefined, unref() {} }) as unknown as ChildProcess)
    ).rejects.toMatchObject({ code: 'helper' })
  })
})

describe('relaunchEnvironment', () => {
  it('keeps the environment of the app but drops what the AppImage runtime sets again', () => {
    const env = relaunchEnvironment({
      PATH: '/usr/bin',
      APPIMAGE_EXTRACT_AND_RUN: '1',
      APPIMAGE: '/old.AppImage',
      APPDIR: '/tmp/.mount_old',
      ARGV0: 'old',
      OWD: '/home/me'
    })
    expect(env).toEqual({ PATH: '/usr/bin', APPIMAGE_EXTRACT_AND_RUN: '1' })
  })
})
