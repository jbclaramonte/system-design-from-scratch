// Runs the real swap script (bash) in scratch folders, with fake `xattr` and `mv` and a fake app.
import { spawn, type ChildProcess } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { launchHelper, type HelperPlan } from './helper'

let root: string
let plan: HelperPlan
const children: ChildProcess[] = []

const script = async (name: string, body: string) => {
  const path = join(root, 'bin', name)
  await writeFile(path, `#!/bin/bash\n${body}\n`)
  await chmod(path, 0o755)
  return path
}
const read = (path: string) => readFile(path, 'utf8')

/** A bundle whose binary logs its version, its arguments and one environment variable. */
async function makeBundle(path: string, version: string) {
  await mkdir(join(path, 'Contents', 'MacOS'), { recursive: true })
  await writeFile(join(path, 'version'), version)
  const executable = join(path, 'Contents', 'MacOS', 'App')
  await writeFile(
    executable,
    `#!/bin/bash\necho "${version} $* env=$SDFS_TEST_ENV" >> "${root}/launch.log"\n`
  )
  await chmod(executable, 0o755)
}

/** The relaunch runs in the background: waits for its line in the log. */
async function launchLog(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    if (existsSync(join(root, 'launch.log'))) return read(join(root, 'launch.log'))
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('the app was not relaunched')
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sdfs-helper-test-'))
  await mkdir(join(root, 'bin'))
  await makeBundle(join(root, 'apps', 'App.app'), 'old')
  await makeBundle(join(root, 'apps', '.stage.app'), 'new')
  await mkdir(join(root, 'work'))
  plan = {
    appPid: await exitedPid(),
    target: join(root, 'apps', 'App.app'),
    staging: join(root, 'apps', '.stage.app'),
    backup: join(root, 'apps', '.old.app'),
    work: join(root, 'work'),
    log: join(root, 'helper.log'),
    waitSeconds: 5,
    executable: 'Contents/MacOS/App',
    args: ['--user-data-dir=/scratch/my data', '--flag'],
    xattrCommand: await script('xattr', `echo "$@" >> "${root}/xattr.log"`)
  }
})

afterEach(async () => {
  for (const child of children) child.kill('SIGKILL')
  children.length = 0
  await rm(root, { recursive: true, force: true })
})

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
async function runHelper(env: NodeJS.ProcessEnv = {}): Promise<number | null> {
  let helper: ChildProcess | undefined
  await launchHelper(plan, (file, args) => {
    helper = spawn(file, args, { stdio: 'ignore', env: { ...process.env, ...env } })
    return helper
  })
  return new Promise((resolve) => helper?.once('exit', resolve))
}

describe('the swap helper', () => {
  it('waits for the app to quit, swaps the bundle, clears quarantine, relaunches and cleans up', async () => {
    plan.appPid = fakeApp(0.6)
    const started = Date.now()
    expect(await runHelper({ SDFS_TEST_ENV: 'kept' })).toBe(0)

    expect(Date.now() - started).toBeGreaterThanOrEqual(400)
    expect(await read(join(plan.target, 'version'))).toBe('new')
    expect(existsSync(plan.staging)).toBe(false)
    expect(existsSync(plan.backup)).toBe(false)
    expect(existsSync(plan.work)).toBe(false)
    // The new app is relaunched with the switches and the environment of the old one.
    expect(await launchLog()).toBe('new --user-data-dir=/scratch/my data --flag env=kept\n')
    expect(await read(join(root, 'xattr.log'))).toContain('-dr com.apple.quarantine')
  })

  it('does not touch the quarantine attribute when there is none', async () => {
    plan.xattrCommand = await script(
      'xattr-none',
      `echo "$@" >> "${root}/xattr.log"; [ "$1" != "-p" ]`
    )
    expect(await runHelper()).toBe(0)
    expect(await read(join(root, 'xattr.log'))).toBe(
      '-p com.apple.quarantine ' + plan.target + '\n'
    )
  })

  it('leaves the old app alone when the app does not quit in time', async () => {
    plan.appPid = fakeApp(30)
    plan.waitSeconds = 1
    expect(await runHelper()).toBe(1)

    expect(await read(join(plan.target, 'version'))).toBe('old')
    expect(existsSync(plan.staging)).toBe(false)
    expect(existsSync(plan.work)).toBe(false)
    // The app is still running: it is not launched a second time.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(existsSync(join(root, 'launch.log'))).toBe(false)
  })

  it('keeps the old app and relaunches it when the staged copy is missing', async () => {
    await rm(plan.staging, { recursive: true })
    expect(await runHelper()).toBe(1)

    expect(await read(join(plan.target, 'version'))).toBe('old')
    expect((await launchLog()).startsWith('old ')).toBe(true)
    expect(existsSync(plan.work)).toBe(false)
  })

  it('puts the old app back when the new one cannot be moved into place', async () => {
    // A `mv` that refuses to move the staged copy.
    await script('mv', `[ "$1" = "${plan.staging}" ] && exit 1; exec /bin/mv "$@"`)
    expect(await runHelper({ PATH: `${join(root, 'bin')}:${process.env.PATH}` })).toBe(1)

    expect(await read(join(plan.target, 'version'))).toBe('old')
    expect(existsSync(plan.backup)).toBe(false)
    expect(existsSync(plan.staging)).toBe(false)
    expect((await launchLog()).startsWith('old ')).toBe(true)
    expect(await read(join(root, 'helper.log'))).toContain('could not move the new app into place')
  })

  it('refuses to start when the helper process cannot be created', async () => {
    await expect(
      launchHelper(plan, () => ({ pid: undefined, unref() {} }) as ChildProcess)
    ).rejects.toMatchObject({
      code: 'helper'
    })
    await expect(
      launchHelper(plan, () => {
        throw new Error('spawn EACCES')
      })
    ).rejects.toMatchObject({ code: 'helper' })
  })
})
