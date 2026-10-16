// The App Update flow: when to check, what is pending, the dismissed version, and the install.
// Everything outside the logic (network, disk, commands, the app itself) is injected.
import type {
  UpdateCheckResult,
  UpdateInfo,
  UpdateInstallResult,
  UpdateProgress
} from '../../shared/update'
import type { CachedLatestRelease, LastUpdateCheck } from '../db/repositories/updateState'
import { toErrorInfo, UpdateError } from './errors'
import { toInstallability, type InstallCheck } from './installable'
import type { AppImagePlan } from './appImageInstaller'
import type { InstallPlan } from './installer'
import { releasePageUrl, type LatestRelease } from './release'
import { isUpdate } from './version'

const DAY_MS = 24 * 60 * 60 * 1000

/** What an install does: the macOS bundle swap, or the replacement of the running AppImage. */
export type UpdatePlan = ({ kind: 'mac' } & InstallPlan) | ({ kind: 'appimage' } & AppImagePlan)

export interface UpdateStore {
  lastCheck(): LastUpdateCheck | null
  saveLastCheck(check: LastUpdateCheck): void
  dismissedVersion(): string | null
  saveDismissedVersion(version: string | null): void
}

export interface UpdateServiceDeps {
  /** The running app version. */
  currentVersion: string
  store: UpdateStore
  /** The "Check for updates at launch" setting, read each time. */
  checkAtLaunchEnabled: () => boolean
  /**
   * Whether the check at launch may run at all: a packaged app, or endpoints overridden by the
   * environment. A development build never reaches GitHub on its own.
   */
  launchCheckAllowed: boolean
  lookup: () => Promise<LatestRelease | null>
  checkInstallable: () => Promise<InstallCheck>
  install: (plan: UpdatePlan, onProgress: (progress: UpdateProgress) => void) => Promise<void>
  /** Pushes `update:available` to the open windows. */
  notify: (update: UpdateInfo) => void
  /** Quits the app a moment later, once the install response has been sent. */
  scheduleQuit: () => void
  now?: () => number
  log?: (message: string) => void
}

export interface UpdateService {
  /** The automatic check: skipped by the setting, and by a check made less than a day ago. */
  checkAtLaunch(): Promise<void>
  /** The "Check for updates" button: always asks GitHub, and shows a dismissed version again. */
  check(): Promise<UpdateCheckResult>
  /** The update to announce: found, newer than this version and not dismissed. */
  pending(): UpdateInfo | null
  /** "Not now": remembers the version, which is not announced again. */
  dismiss(version: string): void
  /**
   * Installs the version (macOS arm64 packaged app, or Linux x64 AppImage); on success the app
   * quits and relaunches.
   */
  install(
    version: string,
    onProgress: (progress: UpdateProgress) => void
  ): Promise<UpdateInstallResult>
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  const now = deps.now ?? Date.now
  const log = deps.log ?? (() => {})
  let pending: UpdateInfo | null = null
  let installing = false

  const describe = async (latest: CachedLatestRelease): Promise<UpdateInfo> => ({
    version: latest.version,
    releaseUrl: latest.releaseUrl,
    install: toInstallability(await deps.checkInstallable(), {
      mac: latest.hasMacBuild,
      appImage: latest.hasAppImage
    })
  })

  /** Asks GitHub and records the answer; `announce` decides whether a found update is pushed. */
  async function lookupAndRecord(announce: (latest: CachedLatestRelease) => boolean) {
    const release = await deps.lookup()
    const latest: CachedLatestRelease | null = release && {
      version: release.version,
      releaseUrl: release.releaseUrl,
      hasMacBuild: release.macBuild !== null,
      hasAppImage: release.linuxBuild !== null
    }
    deps.store.saveLastCheck({ checkedAt: new Date(now()).toISOString(), latest })
    if (!latest || !isUpdate(deps.currentVersion, latest.version)) {
      pending = null
      return null
    }
    if (!announce(latest)) {
      pending = null
      return null
    }
    pending = await describe(latest)
    deps.notify(pending)
    return pending
  }

  return {
    async checkAtLaunch() {
      if (!deps.launchCheckAllowed || !deps.checkAtLaunchEnabled()) return
      const dismissed = () => deps.store.dismissedVersion()
      const last = deps.store.lastCheck()
      const age = last ? now() - Date.parse(last.checkedAt) : Number.NaN
      try {
        if (last && age >= 0 && age < DAY_MS) {
          // Checked less than a day ago: no request, but an update found then is announced again.
          const latest = last.latest
          if (
            latest &&
            isUpdate(deps.currentVersion, latest.version) &&
            dismissed() !== latest.version
          ) {
            pending = await describe(latest)
            deps.notify(pending)
          }
          return
        }
        await lookupAndRecord((latest) => dismissed() !== latest.version)
      } catch (error) {
        // Never blocks the app: a failed automatic check is silent.
        log(`update check at launch failed: ${toErrorInfo(error).message}`)
      }
    },

    async check() {
      try {
        const update = await lookupAndRecord(() => {
          deps.store.saveDismissedVersion(null)
          return true
        })
        return update
          ? { status: 'available', update }
          : { status: 'upToDate', currentVersion: deps.currentVersion }
      } catch (error) {
        return { status: 'error', error: toErrorInfo(error) }
      }
    },

    pending: () => pending,

    dismiss(version) {
      deps.store.saveDismissedVersion(version)
      if (pending?.version === version) pending = null
    },

    async install(version, onProgress) {
      const manualUrl = () =>
        (pending?.version === version ? pending.releaseUrl : undefined) ??
        releasePageUrl(`v${version}`)
      const failure = (error: unknown, url = manualUrl()): UpdateInstallResult => ({
        ok: false,
        error: toErrorInfo(error),
        manualUrl: url
      })
      if (installing) {
        return failure(new UpdateError('busy', 'An update is already being installed.'))
      }
      installing = true
      try {
        const check = await deps.checkInstallable()
        if (!check.canInstall) throw new UpdateError('not_installable', check.reason)
        const release = await deps.lookup()
        if (!release || release.version !== version) {
          throw new UpdateError(
            'stale',
            `The latest release is not version ${version} any more. Check for updates again.`
          )
        }
        let plan: UpdatePlan
        if (check.kind === 'mac') {
          if (!release.macBuild) {
            throw new UpdateError('no_asset', 'This release does not carry the macOS build yet.')
          }
          plan = {
            kind: 'mac',
            version,
            build: release.macBuild,
            bundlePath: check.bundlePath,
            executable: check.executable
          }
        } else {
          if (!release.linuxBuild) {
            throw new UpdateError('no_asset', 'This release does not carry the Linux AppImage yet.')
          }
          plan = {
            kind: 'appimage',
            version,
            build: release.linuxBuild,
            appImagePath: check.appImagePath
          }
        }
        try {
          await deps.install(plan, onProgress)
        } catch (error) {
          installing = false
          return failure(error, release.releaseUrl)
        }
        deps.scheduleQuit()
        // Stays "installing": the app is about to quit and relaunch.
        return { ok: true }
      } catch (error) {
        installing = false
        return failure(error)
      }
    }
  }
}
