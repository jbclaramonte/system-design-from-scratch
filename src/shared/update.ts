/**
 * App Update types shared by the main process and the renderer (banner, Settings section).
 * See docs/concepts/App Update.md and the Updates section of docs/Packaging.md.
 */

/** Why an update failed or cannot be installed; the message is always readable by the learner. */
export type UpdateErrorCode =
  /** The release lookup or a download could not complete (offline, GitHub error, timeout). */
  | 'network'
  /** The release answer is not usable (no valid version, not a release). */
  | 'invalid_release'
  /** The app cannot install itself here (not macOS arm64 or an x64 AppImage, not packaged, not writable...). */
  | 'not_installable'
  /** The release holds no build for this platform (.dmg or .AppImage, or SHA256SUMS, missing). */
  | 'no_asset'
  /** The release changed since the banner was shown. */
  | 'stale'
  /** The downloaded file does not match SHA256SUMS. */
  | 'checksum'
  | 'mount'
  /** The image does not hold this app, or at the announced version. */
  | 'wrong_app'
  /** The new file could not be written or moved into place (disk full, folder not writable). */
  | 'copy'
  | 'signature'
  | 'helper'
  | 'busy'
  | 'unknown'

export interface UpdateErrorInfo {
  code: UpdateErrorCode
  message: string
}

/** Whether this app can install the update itself, and why not when it cannot. */
export type UpdateInstallability = { canInstall: true } | { canInstall: false; reason: string }

/** A release newer than the running version. */
export interface UpdateInfo {
  /** Semver without the leading `v`, for example `0.3.1`. */
  version: string
  /** The release page on GitHub: the release notes, and the manual download. */
  releaseUrl: string
  install: UpdateInstallability
}

export type UpdateCheckResult =
  | { status: 'available'; update: UpdateInfo }
  | { status: 'upToDate'; currentVersion: string }
  /** The check failed (offline, GitHub error); the app keeps working. */
  | { status: 'error'; error: UpdateErrorInfo }

export interface UpdateVersionRequest {
  version: string
}

/** Install outcome. On success the app quits a moment later and relaunches on the new version. */
export type UpdateInstallResult =
  | { ok: true }
  /** `manualUrl`: where to download the release by hand. The installed app is untouched. */
  | { ok: false; error: UpdateErrorInfo; manualUrl: string }

export type UpdatePhase = 'downloading' | 'verifying' | 'preparing' | 'restarting'

/** Progress of an install, pushed on `update:progress`. */
export interface UpdateProgress {
  phase: UpdatePhase
  /** Downloading only. `totalBytes` is null when the server did not announce a size. */
  receivedBytes?: number
  totalBytes?: number | null
}
