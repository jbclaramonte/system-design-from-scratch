import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { isGenerationLanguage, type GenerationLanguage } from '../../../shared/generationLanguage'
import { firstRunText, languageChoices } from './firstRunText'
import './firstRun.css'

/** The two languages of a line, side by side: French first, English after. */
function Bilingual({ line }: { line: { fr: string; en: string } }) {
  return (
    <>
      <span lang="fr">{line.fr}</span>
      <span className="first-run-sep" aria-hidden="true">
        {' / '}
      </span>
      <span lang="en">{line.en}</span>
    </>
  )
}

/** The two languages of a sentence, one under the other. */
function Stacked({ line }: { line: { fr: string; en: string } }) {
  return (
    <>
      <span lang="fr">{line.fr}</span>
      <span lang="en">{line.en}</span>
    </>
  )
}

/**
 * First launch: asks which language the course is written in (the Generation Language) before
 * anything is generated. The choice is a radio group: arrow keys move the selection, Enter
 * confirms, and the focus starts on the preselected choice. Shown instead of the whole app, so
 * nothing else runs or shows behind it. `onChosen` is called once the choice is saved.
 */
export function FirstRunScreen({
  suggestedLanguage,
  onChosen
}: {
  suggestedLanguage: GenerationLanguage
  onChosen: () => void
}) {
  const [selected, setSelected] = useState(suggestedLanguage)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const group = useRef<HTMLFieldSetElement>(null)

  useEffect(() => {
    group.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
  }, [])

  const confirm = () => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    window.api
      .chooseGenerationLanguage({ language: selected })
      .then(onChosen)
      .catch(() => {
        setSaving(false)
        setFailed(true)
      })
  }

  // A radio does not submit a form on Enter in every browser: confirm explicitly.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    confirm()
  }

  return (
    <main className="first-run" data-testid="first-run" onKeyDown={onKeyDown}>
      <form
        className="card first-run-card"
        aria-labelledby="first-run-title"
        onSubmit={(event) => {
          event.preventDefault()
          confirm()
        }}
      >
        <h1 id="first-run-title">
          <Bilingual line={firstRunText.title} />
        </h1>
        <p className="first-run-intro" id="first-run-intro">
          <Stacked line={firstRunText.intro} />
        </p>
        <fieldset
          className="first-run-choices"
          ref={group}
          disabled={saving}
          aria-describedby="first-run-intro first-run-note"
        >
          <legend className="first-run-legend">
            <Bilingual line={firstRunText.title} />
          </legend>
          {languageChoices.map((choice) => (
            <label
              key={choice.language}
              className="first-run-choice"
              data-testid={`first-run-${choice.language}`}
            >
              <input
                type="radio"
                name="generation-language"
                value={choice.language}
                checked={selected === choice.language}
                onChange={(event) => {
                  if (isGenerationLanguage(event.target.value)) setSelected(event.target.value)
                }}
              />
              <span className="first-run-choice-text">
                <span className="first-run-choice-name" lang={choice.language}>
                  {choice.name}
                </span>
                <span className="first-run-choice-detail">
                  <Stacked line={choice.detail} />
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="first-run-note" id="first-run-note">
          <Stacked line={firstRunText.note} />
        </p>
        {failed && (
          <p className="notice notice-error" role="alert" data-testid="first-run-error">
            <Bilingual line={firstRunText.failed} />
          </p>
        )}
        <div className="first-run-actions">
          <button
            type="submit"
            className="btn-primary"
            data-testid="first-run-confirm"
            disabled={saving}
          >
            <Bilingual line={saving ? firstRunText.saving : firstRunText.confirm} />
          </button>
        </div>
      </form>
    </main>
  )
}
