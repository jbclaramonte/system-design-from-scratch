import { useEffect, useState, type FormEvent } from 'react'
import {
  settingsErrors,
  settingsLimits,
  type AppSettings,
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
}

const toDraft = (settings: AppSettings): Draft => ({
  masteryThreshold: String(settings.masteryThreshold),
  roundLimit: String(settings.roundLimit),
  questionsPerQuiz: settings.questionsPerQuiz === null ? '' : String(settings.questionsPerQuiz),
  claudeCliPath: settings.claudeCliPath ?? ''
})

const fromDraft = (draft: Draft): AppSettings => ({
  masteryThreshold: Number(draft.masteryThreshold),
  roundLimit: Number(draft.roundLimit),
  questionsPerQuiz: draft.questionsPerQuiz.trim() ? Number(draft.questionsPerQuiz) : null,
  claudeCliPath: draft.claudeCliPath.trim() || null
})

/** Mastery Threshold, Round Limit, questions per quiz and the Claude Code CLI path. */
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
    return <main style={{ padding: 16 }}>{error ? <p role="alert">{error}</p> : 'Loading...'}</main>
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
      .testCli({ claudeCliPath: values.claudeCliPath })
      .then(setCheck)
      .catch((reason: unknown) =>
        setCheck({ ok: false, error: { code: 'unknown', message: errorMessage(reason) } })
      )
  }

  return (
    <main
      data-testid="settings-screen"
      style={{ maxWidth: '72ch', margin: '0 auto', padding: 16, lineHeight: 1.5 }}
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
        <p>
          <button
            type="button"
            data-testid="settings-test-cli"
            onClick={testCli}
            disabled={check === 'running' || errors.claudeCliPath !== undefined}
          >
            Test
          </button>{' '}
          <span role="status" data-testid="settings-cli-check">
            {check === 'running' && 'Checking...'}
            {check !== null &&
              check !== 'running' &&
              check.ok &&
              `OK: ${check.version} at ${check.path}`}
            {check !== null && check !== 'running' && !check.ok && `${check.error.message}`}
          </span>
        </p>
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
      <small id={`${id}-help`} style={{ color: error ? '#b3261e' : '#555' }}>
        {error ?? help}
      </small>
    </p>
  )
}
