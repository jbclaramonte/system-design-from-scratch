// Where and whether the running app can replace itself. Pure over an injected environment.
import { access, constants, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import type { UpdateInstallability } from '../../shared/update'

export interface InstallEnvironment {
  platform: NodeJS.Platform
  arch: string
  isPackaged: boolean
  /** `app.getPath('exe')`: the executable inside the bundle. */
  execPath: string
  /**
   * Linux: `process.env.APPIMAGE`, which the AppImage runtime sets to the path of the running
   * `.AppImage` file. Unset for a `.deb` install, an unpacked folder or any other run.
   */
  appImage?: string
}

export interface InstallTarget {
  /** The running bundle, for example `/Applications/System Design from Scratch.app`. */
  bundlePath: string
  /** The running binary, relative to the bundle: `Contents/MacOS/System Design from Scratch`. */
  executable: string
}

/**
 * `<x>.app/Contents/MacOS/<binary>` to the bundle `<x>.app` and the binary relative to it; null
 * when the path is not inside a bundle.
 */
export function bundleOfExecutable(execPath: string): InstallTarget | null {
  const match = /^(\/.*\.app)\/(Contents\/MacOS\/[^/]+)$/.exec(execPath)
  return match?.[1] && match[2] ? { bundlePath: match[1], executable: match[2] } : null
}

export type InstallCheck =
  | ({ canInstall: true; kind: 'mac' } & InstallTarget)
  /** `appImagePath`: the running `.AppImage` file (symbolic links resolved), replaced by the new one. */
  | { canInstall: true; kind: 'appimage'; appImagePath: string }
  | { canInstall: false; reason: string }

type Access = (path: string, mode: number) => Promise<void>

/** The disk reads of the Linux check, injectable for tests. */
export interface FileSystemChecks {
  access: Access
  /** True when the path is a regular file. */
  isFile: (path: string) => Promise<boolean>
  realpath: (path: string) => Promise<string>
}

const realFileSystem: FileSystemChecks = {
  access,
  isFile: (path) =>
    stat(path).then(
      (info) => info.isFile(),
      () => false
    ),
  realpath
}

/**
 * Whether the app can install an update itself, and how: on macOS Apple Silicon a packaged app
 * running from an `.app` bundle, on Linux x64 a packaged app running as an AppImage; in both cases
 * in a folder the learner can write (the file is swapped for a copy made next to it). The reason
 * is shown to the learner next to the manual download link.
 */
export async function checkInstallable(
  env: InstallEnvironment,
  canAccess: Access = access,
  files: Partial<FileSystemChecks> = {}
): Promise<InstallCheck> {
  if (env.platform === 'linux' && env.arch === 'x64') {
    return checkAppImage(env, { ...realFileSystem, access: canAccess, ...files })
  }
  if (env.platform !== 'darwin' || env.arch !== 'arm64') {
    return {
      canInstall: false,
      reason:
        'The app installs updates by itself on macOS with Apple Silicon and on Linux x64 (AppImage) only.'
    }
  }
  if (!env.isPackaged) {
    return { canInstall: false, reason: 'This is a development build, not a packaged app.' }
  }
  const target = bundleOfExecutable(env.execPath)
  if (!target) {
    return { canInstall: false, reason: 'The app is not running from an application bundle.' }
  }
  const { bundlePath } = target
  const folder = dirname(bundlePath)
  try {
    await canAccess(folder, constants.W_OK)
    await canAccess(bundlePath, constants.W_OK)
  } catch {
    return {
      canInstall: false,
      reason: `The app cannot replace itself in ${folder}: that folder is not writable for you. Move the app to a folder you own, such as ~/Applications.`
    }
  }
  return { canInstall: true, kind: 'mac', ...target }
}

async function checkAppImage(
  env: InstallEnvironment,
  files: FileSystemChecks
): Promise<InstallCheck> {
  if (!env.isPackaged) {
    return { canInstall: false, reason: 'This is a development build, not a packaged app.' }
  }
  const declared = env.appImage?.trim()
  if (!declared) {
    return {
      canInstall: false,
      reason:
        'The app does not run as an AppImage (a .deb install is updated with apt, which needs administrator rights).'
    }
  }
  const notUsable = {
    canInstall: false as const,
    reason: 'The AppImage file that is running cannot be found, so it cannot be replaced.'
  }
  if (!isAbsolute(declared)) return notUsable
  let appImagePath: string
  try {
    appImagePath = await files.realpath(declared)
  } catch {
    return notUsable
  }
  if (!isAbsolute(appImagePath) || !(await files.isFile(appImagePath))) return notUsable
  const folder = dirname(appImagePath)
  try {
    // The folder receives the new file, then the rename replaces the old one.
    await files.access(folder, constants.W_OK)
    await files.access(appImagePath, constants.W_OK)
  } catch {
    return {
      canInstall: false,
      reason: `The app cannot replace itself in ${folder}: that folder is not writable for you. Move the AppImage to a folder you own, such as ~/.local/share/system-design-from-scratch.`
    }
  }
  return { canInstall: true, kind: 'appimage', appImagePath }
}

/** Which builds a release carries, for the platform the update is for. */
export interface ReleaseBuilds {
  mac: boolean
  appImage: boolean
}

/** The `UpdateInfo.install` value of a check. */
export function toInstallability(check: InstallCheck, builds: ReleaseBuilds): UpdateInstallability {
  if (!check.canInstall) return { canInstall: false, reason: check.reason }
  if (check.kind === 'mac' && !builds.mac) {
    return {
      canInstall: false,
      reason: 'This release does not carry the macOS build yet. Try again in a while.'
    }
  }
  if (check.kind === 'appimage' && !builds.appImage) {
    return {
      canInstall: false,
      reason: 'This release does not carry the Linux AppImage yet. Try again in a while.'
    }
  }
  return { canInstall: true }
}
