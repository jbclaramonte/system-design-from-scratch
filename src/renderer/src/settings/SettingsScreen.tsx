import { useEffect, useState, type FormEvent } from 'react'
import {
  settingsErrors,
  settingsLimits,
  type AppSettings,
  type CliAuthStatus,
  type CliCheck
} from '../../../shared/settings'
import { errorMessage } from '../quiz/errorMessage'
import './settings.css'

/** Form values: text inputs, parsed on save. */
interface Draft {
  masteryThreshold: string
  roundLimit: string
  /** Empty = automatic. */
  questionsPerQuiz: string
  /** Empty = automatic lookup. */
  claudeCliPath: string
  /** Empty = inherit the environment. */
  claudeConfigDir: string
}

const toDraft = (settings: AppSettings): Draft => ({
  masteryThreshold: String(settings.masteryThreshold),
  roundLimit: String(settings.roundLimit),
  questionsPerQuiz: settings.questionsPerQuiz === null ? '' : String(settings.questionsPerQuiz),
  claudeCliPath: settings.claudeCliPath ?? '',
  claudeConfigDir: settings.claudeConfigDir ?? ''
})

const fromDraft = (draft: Draft): AppSettings => ({
  masteryThreshold: Number(draft.masteryThreshold),
  roundLimit: Number(draft.roundLimit),
  questionsPerQuiz: draft.questionsPerQuiz.trim() ? Number(draft.questionsPerQuiz) : null,
  claudeCliPath: draft.claudeCliPath.trim() || null,
  claudeConfigDir: draft.claudeConfigDir.trim() || null
})

/**
 * Mastery Threshold, Round Limit, questions per quiz, the Claude Code CLI path and the Claude
 * config directory (profile).
 */
export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<CliCheck | 'running' | null>(null)

  useEffect(() => {
    window.api
      .getSettings()
      .then((settings) => setDraft(toDraft(settings)))
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])

  if (!draft) {
    return (
      <main className="settings-screen">
        {error ? <p role="alert">{error}</p> : <p>Loading...</p>}
      </main>
    )
  }

  const values = fromDraft(draft)
  const errors = settingsErrors(values)
  const valid = Object.keys(errors).length === 0
  const edit = (field: keyof Draft) => (value: string) => {
    setStatus(null)
    setDraft({ ...draft, [field]: value })
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    setError(null)
    window.api
      .updateSettings(values)
      .then((saved) => {
        setDraft(toDraft(saved))
        setStatus('Saved. Applied from now on, no restart needed.')
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  const testCli = () => {
    setCheck('running')
    window.api
      .testCli({ claudeCliPath: values.claudeCliPath, claudeConfigDir: values.claudeConfigDir })
      .then(setCheck)
      .catch((reason: unknown) =>
        setCheck({ ok: false, error: { code: 'unknown', message: errorMessage(reason) } })
      )
  }

  const checkFailed = check !== null && check !== 'running' && !check.ok

  return (
    <main className="settings-screen" data-testid="settings-screen">
      <header className="settings-header">
        <h1>Settings</h1>
        <button type="button" className="btn-sm" onClick={onClose}>
          Back
        </button>
      </header>
      <form onSubmit={save} noValidate>
        <div className="settings-groups">
          <section className="card settings-group" aria-labelledby="settings-cli-title">
            <h2 id="settings-cli-title">Claude Code</h2>
            <p className="settings-group-intro">
              How the app reaches the Claude Code CLI, which generates the course content.
            </p>
            <Field
              id="claude-cli-path"
              label="Claude Code CLI path"
              help="Empty: found automatically (PATH, usual install locations, login shell)."
              value={draft.claudeCliPath}
              onChange={(value) => {
                setCheck(null)
                edit('claudeCliPath')(value)
              }}
              error={errors.claudeCliPath}
              placeholder="Automatic"
              mono
            />
            <Field
              id="claude-config-dir"
              label="Claude config directory"
              help="Empty: the profile of the environment the app was started from (usually ~/.claude). Set it when your logged-in profile lives elsewhere, for example ~/.claude-perso with CLAUDE_CONFIG_DIR: an app started from the Finder or the Dock does not see that variable. Absolute path of an existing directory (in a file dialog, Cmd+Shift+. shows hidden folders)."
              value={draft.claudeConfigDir}
              onChange={(value) => {
                setCheck(null)
                edit('claudeConfigDir')(value)
              }}
              error={errors.claudeConfigDir}
              placeholder="Inherit the environment"
              mono
            />
            <div className="settings-test">
              <div className="settings-test-bar">
                <button
                  type="button"
                  data-testid="settings-test-cli"
                  onClick={testCli}
                  disabled={
                    check === 'running' ||
                    errors.claudeCliPath !== undefined ||
                    errors.claudeConfigDir !== undefined
                  }
                >
                  Test
                </button>
                <small className="settings-help">
                  Runs <code>claude --version</code> and <code>claude auth status</code> with the
                  values above (no model call).
                </small>
              </div>
              <div role="status" data-testid="settings-cli-check" className="settings-check-live">
                {check === 'running' && <p className="settings-help">Checking...</p>}
                {checkFailed && (
                  <div className="settings-check settings-check-failed">
                    <span className="chip chip-error chip-dot">Failed</span>
                    <p>{check.error.message}</p>
                  </div>
                )}
                {check !== null && check !== 'running' && check.ok && (
                  <div className="settings-check">
                    <p>
                      <span className="chip chip-mastered chip-dot">OK</span>{' '}
                      <span className="settings-check-text">
                        {check.version} at <code>{check.path}</code>
                      </span>
                    </p>
                    {check.auth.ok ? (
                      <AuthStatusView
                        status={check.auth.status}
                        configDir={values.claudeConfigDir}
                      />
                    ) : (
                      <p>
                        <span className="chip chip-attention chip-dot">Unknown</span> Login state
                        unknown: {check.auth.error.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card settings-group" aria-labelledby="settings-mastery-title">
            <h2 id="settings-mastery-title">Mastery Loop</h2>
            <p className="settings-group-intro">
              When a topic counts as mastered, and how many rounds a learner may fail.
            </p>
            <Field
              id="mastery-threshold"
              label="Mastery Threshold (%)"
              help="Minimum quiz score to master a topic. Applies to the rounds completed from now on."
              value={draft.masteryThreshold}
              onChange={edit('masteryThreshold')}
              error={errors.masteryThreshold}
              type="number"
              min={settingsLimits.masteryThreshold.min}
              max={settingsLimits.masteryThreshold.max}
              mono
              short
            />
            <Field
              id="round-limit"
              label="Round Limit"
              help="Rounds without reaching the threshold before the app offers another angle or a skip."
              value={draft.roundLimit}
              onChange={edit('roundLimit')}
              error={errors.roundLimit}
              type="number"
              min={settingsLimits.roundLimit.min}
              max={settingsLimits.roundLimit.max}
              mono
              short
            />
            <Field
              id="questions-per-quiz"
              label="Questions per quiz"
              help="Empty: automatic, 6 or one per targeted notion if there are more."
              value={draft.questionsPerQuiz}
              onChange={edit('questionsPerQuiz')}
              error={errors.questionsPerQuiz}
              type="number"
              min={settingsLimits.questionsPerQuiz.min}
              max={settingsLimits.questionsPerQuiz.max}
              placeholder="Automatic"
              mono
              short
            />
          </section>
        </div>
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
        <div className="settings-actions">
          <button
            type="submit"
            className="btn-primary"
            data-testid="settings-save"
            disabled={!valid}
          >
            Save
          </button>
          {status && (
            <span role="status" data-testid="settings-status" className="settings-saved">
              {status}
            </span>
          )}
          {!valid && <span className="settings-help">Fix the highlighted fields to save.</span>}
        </div>
      </form>
    </main>
  )
}

/** Login state of the tested profile, and what to do when it is logged out. */
function AuthStatusView({
  status,
  configDir
}: {
  status: CliAuthStatus
  configDir: string | null
}) {
  const dir = status.configDirectory ?? configDir ?? '~/.claude'
  return (
    <>
      <dl data-testid="settings-auth-status" className="settings-auth">
        <dt className="label-caps">Login</dt>
        <dd data-testid="settings-auth-logged-in">
          {status.loggedIn ? (
            <span className="chip chip-mastered chip-dot">Logged in</span>
          ) : (
            <span className="chip chip-error chip-dot">Not logged in</span>
          )}
        </dd>
        <dt className="label-caps">Auth method</dt>
        <dd className="label-mono">
          {status.authMethod}
          {status.apiProvider && status.apiProvider !== 'firstParty' && ` (${status.apiProvider})`}
        </dd>
        {status.email && (
          <>
            <dt className="label-caps">Account</dt>
            <dd className="label-mono">{status.email}</dd>
          </>
        )}
        <dt className="label-caps">Config directory</dt>
        <dd data-testid="settings-auth-config-dir" className="label-mono">
          {dir}
        </dd>
      </dl>
      {!status.loggedIn && (
        <p role="alert" data-testid="settings-auth-help" className="settings-error">
          This profile is not logged in, so every generation will fail. Either log it in: run{' '}
          <code>CLAUDE_CONFIG_DIR={dir} claude</code> in a terminal and use <code>/login</code>, or
          set the Claude config directory above to the profile that is logged in, then Test again
          and Save.
        </p>
      )}
    </>
  )
}

function Field({
  id,
  label,
  help,
  value,
  onChange,
  error,
  mono,
  short,
  ...input
}: {
  id: string
  label: string
  help: string
  value: string
  onChange: (value: string) => void
  error: string | undefined
  /** Technical values (paths, numbers) are written in the mono font. */
  mono?: boolean
  /** Narrow input, for a number. */
  short?: boolean
  type?: string
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <div className="settings-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-testid={`settings-${id}`}
        className={`${mono ? 'settings-mono' : ''}${short ? ' settings-short' : ''}`.trim()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-help`}
        {...input}
      />
      <small
        id={`${id}-help`}
        className={error ? 'settings-help settings-help-error' : 'settings-help'}
      >
        {error ?? help}
      </small>
    </div>
  )
}
