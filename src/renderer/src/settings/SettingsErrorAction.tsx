import type { GenerationErrorCode } from '../../../shared/generation'
import { useOpenSettings } from './openSettings'

/**
 * What to do about a Generation error that Retry cannot fix (`not_logged_in`): pick the Claude
 * profile that is logged in, or test the login, in Settings. Shown next to Retry in every
 * Generation error display; renders nothing for other codes.
 */
export function SettingsErrorAction({ code }: { code: GenerationErrorCode | 'refused' }) {
  const openSettings = useOpenSettings()
  if (code !== 'not_logged_in') return null
  return (
    <span className="settings-error-action" data-testid="settings-error-action">
      Retry will fail until the CLI is logged in for the profile the app uses.{' '}
      {openSettings && (
        <button type="button" data-testid="open-settings-from-error" onClick={openSettings}>
          Open Settings
        </button>
      )}
    </span>
  )
}
