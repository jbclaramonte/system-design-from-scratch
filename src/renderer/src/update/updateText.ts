import type { UpdateCheckResult, UpdateInfo, UpdateProgress } from '../../../shared/update'

export const availableMessage = (update: Pick<UpdateInfo, 'version'>) =>
  `Version ${update.version} is available.`

/** "42%" of a download, or null when the size is unknown. */
export function downloadPercent(progress: UpdateProgress): number | null {
  const { receivedBytes, totalBytes } = progress
  if (receivedBytes === undefined || !totalBytes) return null
  return Math.min(100, Math.floor((receivedBytes / totalBytes) * 100))
}

/** What the banner says while an install runs. */
export function progressLabel(progress: UpdateProgress | null): string {
  switch (progress?.phase) {
    case undefined:
    case 'downloading': {
      const percent = progress ? downloadPercent(progress) : null
      return percent === null
        ? 'Downloading the update...'
        : `Downloading the update... ${percent}%`
    }
    case 'verifying':
      return 'Checking the download...'
    case 'preparing':
      return 'Preparing the new version...'
    case 'restarting':
      return 'Restarting on the new version...'
  }
}

/** The result of the "Check for updates" button, in one sentence. */
export function checkResultMessage(result: UpdateCheckResult): string {
  switch (result.status) {
    case 'available':
      return `${availableMessage(result.update)} The banner at the top of the window lets you install it.`
    case 'upToDate':
      return `You are up to date (version ${result.currentVersion}).`
    case 'error':
      return `Could not check for updates. ${result.error.message}`
  }
}

/**
 * Whether the update banner is shown: an update is pending, and no Quiz round or Design Exercise
 * holds it back (`holds` counts the open ones). An install in progress stays visible: the learner
 * started it on purpose.
 */
export function isBannerVisible({
  hasPending,
  holds,
  installing
}: {
  hasPending: boolean
  holds: number
  installing: boolean
}): boolean {
  return hasPending && (holds === 0 || installing)
}
