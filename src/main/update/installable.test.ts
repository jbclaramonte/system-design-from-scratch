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
      kind: 'mac',
      bundlePath: '/Applications/System Design from Scratch.app',
      executable: 'Contents/MacOS/System Design from Scratch'
    })
  })

  it('refuses another platform or architecture', async () => {
    for (const change of [
      { platform: 'linux' as const, arch: 'arm64' },
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

const IMAGE = '/home/me/.local/share/system-design-from-scratch/app.AppImage'
const linux: InstallEnvironment = {
  platform: 'linux',
  arch: 'x64',
  isPackaged: true,
  execPath: '/tmp/.mount_appXYZ/system-design-from-scratch',
  appImage: IMAGE
}
const files = {
  realpath: (path: string) => Promise.resolve(path),
  isFile: () => Promise.resolve(true)
}

describe('checkInstallable on Linux', () => {
  it('accepts a packaged AppImage in a writable folder, by the APPIMAGE path', async () => {
    expect(await checkInstallable(linux, writable, files)).toEqual({
      canInstall: true,
      kind: 'appimage',
      appImagePath: IMAGE
    })
  })

  it('replaces the file behind a symbolic link, not the link', async () => {
    const check = await checkInstallable(linux, writable, {
      ...files,
      realpath: () => Promise.resolve('/data/real.AppImage')
    })
    expect(check).toMatchObject({ canInstall: true, appImagePath: '/data/real.AppImage' })
  })

  it('falls back to the notification for a run that is not an AppImage (deb, unpacked folder)', async () => {
    for (const appImage of [undefined, '', '  ']) {
      expect(await checkInstallable({ ...linux, appImage }, writable, files)).toMatchObject({
        canInstall: false,
        reason: expect.stringContaining('.deb')
      })
    }
  })

  it('refuses a development build even when APPIMAGE is set', async () => {
    expect(await checkInstallable({ ...linux, isPackaged: false }, writable, files)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('development build')
    })
  })

  it('refuses an APPIMAGE path that is relative, missing or not a file', async () => {
    const relative = { ...linux, appImage: 'app.AppImage' }
    expect(await checkInstallable(relative, writable, files)).toMatchObject({ canInstall: false })
    const missing = { ...files, realpath: () => Promise.reject(new Error('ENOENT')) }
    expect(await checkInstallable(linux, writable, missing)).toMatchObject({ canInstall: false })
    const folder = { ...files, isFile: () => Promise.resolve(false) }
    expect(await checkInstallable(linux, writable, folder)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('cannot be found')
    })
  })

  it('refuses a folder or a file that is not writable, and names the folder', async () => {
    expect(await checkInstallable(linux, readOnly, files)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('/home/me/.local/share/system-design-from-scratch')
    })
    const onlyFile = (path: string) => (path === IMAGE ? readOnly() : writable())
    expect(await checkInstallable(linux, onlyFile, files)).toMatchObject({ canInstall: false })
  })

  it('refuses a Linux arm64 machine', async () => {
    expect(await checkInstallable({ ...linux, arch: 'arm64' }, writable, files)).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('Linux x64')
    })
  })
})

describe('toInstallability', () => {
  const mac = {
    canInstall: true as const,
    kind: 'mac' as const,
    bundlePath: '/x.app',
    executable: 'Contents/MacOS/x'
  }
  const appimage = {
    canInstall: true as const,
    kind: 'appimage' as const,
    appImagePath: '/x.AppImage'
  }

  it('is installable only with the build of its platform in the release', () => {
    expect(toInstallability(mac, { mac: true, appImage: false })).toEqual({ canInstall: true })
    expect(toInstallability(mac, { mac: false, appImage: true })).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('macOS build')
    })
    expect(toInstallability(appimage, { mac: false, appImage: true })).toEqual({
      canInstall: true
    })
    expect(toInstallability(appimage, { mac: true, appImage: false })).toMatchObject({
      canInstall: false,
      reason: expect.stringContaining('Linux AppImage')
    })
    expect(
      toInstallability({ canInstall: false, reason: 'because' }, { mac: true, appImage: true })
    ).toEqual({ canInstall: false, reason: 'because' })
  })
})
