// Where and whether the running app can replace itself. Pure over an injected environment.
import { access, constants } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { UpdateInstallability } from '../../shared/update'

export interface InstallEnvironment {
  platform: NodeJS.Platform
  arch: string
  isPackaged: boolean
  /** `app.getPath('exe')`: the executable inside the bundle. */
  execPath: string
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
  ({ canInstall: true } & InstallTarget) | { canInstall: false; reason: string }

type Access = (path: string, mode: number) => Promise<void>

/**
 * Whether the app can install an update itself: macOS on Apple Silicon, a packaged app running
 * from an `.app` bundle, in a folder the learner can write (the bundle is swapped for a copy made
 * next to it). The reason is shown to the learner next to the manual download link.
 */
export async function checkInstallable(
  env: InstallEnvironment,
  canAccess: Access = access
): Promise<InstallCheck> {
  if (env.platform !== 'darwin' || env.arch !== 'arm64') {
    return {
      canInstall: false,
      reason: 'The app installs updates by itself on macOS with Apple Silicon only.'
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
  return { canInstall: true, ...target }
}

/** The `UpdateInfo.install` value of a check. */
export function toInstallability(check: InstallCheck, hasMacBuild: boolean): UpdateInstallability {
  if (!check.canInstall) return { canInstall: false, reason: check.reason }
  if (!hasMacBuild) {
    return {
      canInstall: false,
      reason: 'This release does not carry the macOS build yet. Try again in a while.'
    }
  }
  return { canInstall: true }
}
