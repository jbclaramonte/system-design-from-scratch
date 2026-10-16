import { describe, expect, it } from 'vitest'
import {
  bundleOfExecutable,
  checkInstallable,
  toInstallability,
  type InstallEnvironment
} from './installable'

const EXEC =
  '/Applications/System Design from Scratch.app/Contents/MacOS/System Design from Scratch'
const packaged: InstallEnvironment = {
  platform: 'darwin',
  arch: 'arm64',
  isPackaged: true,
  execPath: EXEC
}
const writable = () => Promise.resolve()
const readOnly = () => Promise.reject(new Error('EACCES'))

describe('bundleOfExecutable', () => {
  it('finds the bundle of an executable inside it, and the binary relative to it', () => {
    expect(bundleOfExecutable(EXEC)).toEqual({
      bundlePath: '/Applications/System Design from Scratch.app',
      executable: 'Contents/MacOS/System Design from Scratch'
    })
    expect(bundleOfExecutable('/Users/me/Applications/A.app/Contents/MacOS/A')).toEqual({
      bundlePath: '/Users/me/Applications/A.app',
      executable: 'Contents/MacOS/A'
    })
  })

  it('is null for a path that is not in a bundle', () => {
    expect(bundleOfExecutable('/repo/node_modules/electron/dist/electron')).toBeNull()
    expect(bundleOfExecutable('/Applications/A.app/Contents/Resources/x')).toBeNull()
    expect(bundleOfExecutable('relative/A.app/Contents/MacOS/A')).toBeNull()
  })
})

describe('checkInstallable', () => {
  it('accepts a packaged app in a writable folder on macOS arm64', async () => {
    expect(await checkInstallable(packaged, writable)).toEqual({
      canInstall: true,
      bundlePath: '/Applications/System Design from Scratch.app',
      executable: 'Contents/MacOS/System Design from Scratch'
    })
  })

  it('refuses another platform or architecture', async () => {
    for (const change of [
      { platform: 'linux' as const },
      { platform: 'win32' as const },
      { arch: 'x64' }
    ]) {
      const check = await checkInstallable({ ...packaged, ...change }, writable)
      expect(check).toMatchObject({ canInstall: false, reason: expect.stringContaining('macOS') })
    }
  })

  it('refuses an app that is not packaged', async () => {
    expect(await checkInstallable({ ...packaged, isPackaged: false }, writable)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('development build')
    })
  })

  it('refuses an app that does not run from an app bundle', async () => {
    const env = { ...packaged, execPath: '/opt/sdfs/system-design-from-scratch' }
    expect(await checkInstallable(env, writable)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('application bundle')
    })
  })

  it('refuses a folder or a bundle that is not writable, and names the folder', async () => {
    const check = await checkInstallable(packaged, readOnly)
    expect(check).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('/Applications')
    })
    const onlyBundle = (path: string) => (path.endsWith('.app') ? readOnly() : writable())
    expect(await checkInstallable(packaged, onlyBundle)).toMatchObject({ canInstall: false })
  })
})

describe('toInstallability', () => {
  it('is installable only with a macOS build in the release', () => {
    const ok = { canInstall: true as const, bundlePath: '/x.app', executable: 'Contents/MacOS/x' }
    expect(toInstallability(ok, true)).toEqual({ canInstall: true })
    expect(toInstallability(ok, false)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('macOS build')
    })
    expect(toInstallability({ canInstall: false, reason: 'because' }, true)).toEqual({
      canInstall: false,
      reason: 'because'
    })
  })
})
