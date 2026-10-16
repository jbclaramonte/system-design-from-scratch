import { useState } from 'react'
import type { UpdateCheckResult } from '../../../shared/update'
import { errorMessage } from '../quiz/errorMessage'
import { useUpdates } from './UpdateProvider'
import { checkResultMessage } from './updateText'
import './update.css'

/**
 * The Settings card of App Updates: "Check for updates at launch" (saved with the form) and the
 * "Check for updates" button, which works whatever the setting is. The only request is to the
 * GitHub release API; nothing identifying is sent.
 */
export function UpdatesSection({
  checkAtLaunch,
  onCheckAtLaunchChange
}: {
  checkAtLaunch: boolean
  onCheckAtLaunchChange: (checked: boolean) => void
}) {
  const { checkNow } = useUpdates()
  const [result, setResult] = useState<UpdateCheckResult | 'running' | null>(null)

  const check = () => {
    setResult('running')
    checkNow()
      .then(setResult)
      .catch((reason: unknown) =>
        setResult({ status: 'error', error: { code: 'unknown', message: errorMessage(reason) } })
      )
  }

  return (
    <section className="card settings-group" aria-labelledby="settings-updates-title">
      <h2 id="settings-updates-title">Updates</h2>
      <p className="settings-group-intro">
        The app looks for a newer release on GitHub. The only request is to the GitHub release page
        of this project; nothing about you is sent.
      </p>
      <div className="settings-field">
        <label htmlFor="check-updates-at-launch" className="settings-checkbox">
          <input
            id="check-updates-at-launch"
            type="checkbox"
            data-testid="settings-check-updates-at-launch"
            checked={checkAtLaunch}
            onChange={(event) => onCheckAtLaunchChange(event.target.checked)}
            aria-describedby="check-updates-at-launch-help"
          />
          Check for updates at launch
        </label>
        <small id="check-updates-at-launch-help" className="settings-help">
          At most once a day. Save to apply. The button below works whatever this is set to.
        </small>
      </div>
      <div className="settings-test-bar">
        <button
          type="button"
          data-testid="settings-check-updates"
          onClick={check}
          disabled={result === 'running'}
        >
          Check for updates
        </button>
      </div>
      <p
        role="status"
        className="settings-help update-check-result"
        data-testid="settings-update-result"
      >
        {result === 'running' ? 'Checking...' : result ? checkResultMessage(result) : null}
      </p>
    </section>
  )
}
