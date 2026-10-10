import { useEffect, useState, type FormEvent } from 'react'
import {
  settingsErrors,
  settingsLimits,
  type AppSettings,
  type CliAuthStatus,
  type CliCheck
} from '../../../shared/settings'
import { errorMessage } from '../quiz/errorMessage'

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
    return <main>{error ? <p role="alert">{error}</p> : 'Loading...'}</main>
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

  return (
    <main
      data-testid="settings-screen"
      style={{ maxWidth: '72ch', margin: '0 auto', lineHeight: 1.5 }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" onClick={onClose}>
          Back
        </button>
        <h1 style={{ fontSize: '1.4em', margin: 0 }}>Settings</h1>
      </header>
      <form onSubmit={save} noValidate>
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
        />
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
        />
        <div>
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
          </button>{' '}
          <small style={{ color: 'var(--color-text-secondary)' }}>
            Runs <code>claude --version</code> and <code>claude auth status</code> with the values
            above (no model call).
          </small>
          <div role="status" data-testid="settings-cli-check">
            {check === 'running' && <p>Checking...</p>}
            {check !== null && check !== 'running' && !check.ok && <p>{check.error.message}</p>}
            {check !== null && check !== 'running' && check.ok && (
              <>
                <p>
                  OK: {check.version} at {check.path}
                </p>
                {check.auth.ok ? (
                  <AuthStatusView status={check.auth.status} configDir={values.claudeConfigDir} />
                ) : (
                  <p>Login state unknown: {check.auth.error.message}</p>
                )}
              </>
            )}
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <p>
          <button type="submit" data-testid="settings-save" disabled={!valid}>
            Save
          </button>{' '}
          {status && (
            <span role="status" data-testid="settings-status">
              {status}
            </span>
          )}
        </p>
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
      <dl data-testid="settings-auth-status" style={{ margin: '0.25rem 0' }}>
        <dt>Login</dt>
        <dd data-testid="settings-auth-logged-in">
          {status.loggedIn ? 'Logged in' : 'Not logged in'}
        </dd>
        <dt>Auth method</dt>
        <dd>
          {status.authMethod}
          {status.apiProvider && status.apiProvider !== 'firstParty' && ` (${status.apiProvider})`}
        </dd>
        {status.email && (
          <>
            <dt>Account</dt>
            <dd>{status.email}</dd>
          </>
        )}
        <dt>Config directory</dt>
        <dd data-testid="settings-auth-config-dir">{dir}</dd>
      </dl>
      {!status.loggedIn && (
        <p role="alert" data-testid="settings-auth-help">
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
  ...input
}: {
  id: string
  label: string
  help: string
  value: string
  onChange: (value: string) => void
  error: string | undefined
  type?: string
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <p style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id}>
        <strong>{label}</strong>
      </label>
      <input
        id={id}
        data-testid={`settings-${id}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-help`}
        style={{ maxWidth: '40ch' }}
        {...input}
      />
      <small
        id={`${id}-help`}
        style={{ color: error ? 'var(--color-error-text)' : 'var(--color-text-secondary)' }}
      >
        {error ?? help}
      </small>
    </p>
  )
}
