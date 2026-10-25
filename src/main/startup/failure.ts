import { SchemaTooNewError } from '../db/compatibility'

export const RELEASES_URL = 'https://github.com/jbclaramonte/system-design-from-scratch/releases'

/**
 * When set (smoke tests, scripts), a fatal startup error is only logged: no dialog is opened, the
 * app exits with code 1. A learner never sets it.
 */
export const NO_DIALOG_ENV = 'SDFS_NO_DIALOG'

export interface StartupFailureDialog {
  title: string
  message: string
  detail: string
  /** The first button opens the Releases page when `opensReleases`, else every button quits. */
  buttons: string[]
}

export interface StartupFailure {
  dialog: StartupFailureDialog
  opensReleases: boolean
}

/** What to tell the learner about a fatal startup error, in plain English. */
export function describeStartupFailure(error: unknown, dataDir: string): StartupFailure {
  if (error instanceof SchemaTooNewError) {
    return {
      opensReleases: true,
      dialog: {
        title: 'Update System Design from Scratch',
        message: 'Your data was created by a newer version of the app.',
        detail:
          'Nothing was changed. Update the app to the latest version to open it again. ' +
          `(Your data uses format ${error.found}; this version understands up to ${error.supported}.)`,
        buttons: ['Open the Releases page', 'Quit']
      }
    }
  }
  const reason = error instanceof Error ? error.message : String(error)
  return {
    opensReleases: false,
    dialog: {
      title: 'System Design from Scratch cannot start',
      message: 'The app could not start.',
      detail: `${reason}\n\nData folder: ${dataDir}`,
      buttons: ['Quit']
    }
  }
}

export interface StartupFailureDeps {
  showMessageBox(options: {
    type: 'error'
    title: string
    message: string
    detail: string
    buttons: string[]
    defaultId: number
    cancelId: number
  }): Promise<{ response: number }>
  openExternal(url: string): Promise<void>
  exit(code: number): void
  log(message: string): void
  env: Record<string, string | undefined>
}

/**
 * Reports a fatal startup error and exits with code 1: a dialog (with a button to the Releases page
 * when the data is newer than the app), the same text on stderr. It never throws and always exits.
 */
export async function reportStartupFailure(
  error: unknown,
  dataDir: string,
  deps: StartupFailureDeps
): Promise<void> {
  const { dialog, opensReleases } = describeStartupFailure(error, dataDir)
  deps.log(`${dialog.message} ${dialog.detail.replace(/\n+/g, ' ')}`)
  try {
    if (!deps.env[NO_DIALOG_ENV]) {
      const last = dialog.buttons.length - 1
      const { response } = await deps.showMessageBox({
        type: 'error',
        title: dialog.title,
        message: dialog.message,
        detail: dialog.detail,
        buttons: dialog.buttons,
        defaultId: 0,
        cancelId: last
      })
      if (opensReleases && response === 0) await deps.openExternal(RELEASES_URL)
    }
  } catch (dialogError) {
    deps.log(`Could not show the startup error: ${String(dialogError)}`)
  }
  deps.exit(1)
}
