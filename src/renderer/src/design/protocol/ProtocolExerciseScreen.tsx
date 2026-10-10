import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
  PROTOCOL_STEP_DEFINITIONS,
  type ProtocolExerciseView,
  type ProtocolStep,
  type ProtocolStepView,
  type ProtocolSubmissionInput
} from '../../../../shared/protocol'
import { errorMessage } from '../../quiz/errorMessage'
import { DesignCanvas } from '../DesignCanvas'
import { exportDesign } from '../export'
import { CallStatus, FinalReviewPanel, SubmissionHistory } from './FeedbackViews'
import { StepLesson } from './StepLesson'
import {
  defaultStep,
  hintButtonLabel,
  hintLevelLabels,
  stepStatus,
  stepTitle
} from './protocolText'
import { useProtocolCall } from './useProtocolCall'
import '../../lesson/lesson.css'
import './protocol.css'

const DRAFT_SAVE_DELAY_MS = 600

/** Editor text of a step, saved (debounced) as its draft. */
function useDraft(designExerciseId: number, step: ProtocolStepView) {
  const [text, setText] = useState(step.draft)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pending = useRef<string | null>(null)

  const flush = useCallback(() => {
    if (pending.current === null) return
    const value = pending.current
    pending.current = null
    window.api
      .saveProtocolDraft({ designExerciseId, step: step.step, text: value })
      .then(() => setSaveError(null))
      .catch((reason: unknown) => setSaveError(errorMessage(reason)))
  }, [designExerciseId, step.step])

  useEffect(() => {
    if (pending.current === null) return
    const timer = setTimeout(flush, DRAFT_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, flush])

  // Saves what is left when the step closes.
  useEffect(() => flush, [flush])

  const change = (value: string) => {
    pending.current = value
    setText(value)
  }
  return { text, change, saveError }
}

/** One active step: its lesson on first encounter, its editor, Hints, submission and feedback. */
function StepPanel({
  view,
  step,
  editor,
  onExercise
}: {
  view: ProtocolExerciseView
  step: ProtocolStepView
  editor: Editor | null
  onExercise: (view: ProtocolExerciseView) => void
}) {
  const definition = PROTOCOL_STEP_DEFINITIONS[step.step]
  const draft = useDraft(view.id, step)
  const submit = useProtocolCall(onExercise)
  const hint = useProtocolCall(onExercise)
  const [lessonOpen, setLessonOpen] = useState(!step.lessonSeen)
  const [exportError, setExportError] = useState<string | null>(null)
  const busy = submit.pending || hint.pending

  /** What the learner has now: the editor text, or the live canvas with the notes. */
  const current = async (): Promise<ProtocolSubmissionInput | null> => {
    if (definition.input === 'text') return { type: 'text', text: draft.text }
    if (!editor) {
      setExportError('The Design Canvas is not ready yet.')
      return null
    }
    try {
      setExportError(null)
      return {
        type: 'canvas',
        designExport: await exportDesign(editor, view.id),
        notes: draft.text
      }
    } catch (reason) {
      setExportError(`Could not export the design: ${errorMessage(reason)}`)
      return null
    }
  }

  const onSubmit = async () => {
    const submission = await current()
    if (!submission) return
    submit.run((requestId) =>
      window.api.submitProtocolStep({
        requestId,
        designExerciseId: view.id,
        step: step.step,
        submission
      })
    )
  }

  const onHint = async () => {
    const work = await current()
    if (!work) return
    hint.run((requestId) =>
      window.api.requestHint({
        requestId,
        designExerciseId: view.id,
        step: step.step,
        current: work
      })
    )
  }

  const closeLesson = () => {
    setLessonOpen(false)
    if (!step.lessonSeen) {
      window.api
        .markProtocolLessonSeen({ designExerciseId: view.id, step: step.step })
        .then(onExercise)
        .catch((reason: unknown) => setExportError(errorMessage(reason)))
    }
  }

  return (
    <section className="protocol-step" data-testid="step-panel" data-step={step.step}>
      <header>
        <h3>
          {definition.title}{' '}
          {step.isNew && <span className="lesson-badge protocol-new">New in this exercise</span>}
        </h3>
        <p className="protocol-goal">{definition.goal}</p>
      </header>
      {lessonOpen ? (
        <StepLesson
          step={step.step}
          closeLabel={step.lessonSeen ? 'Close' : 'Got it, start the step'}
          onClose={closeLesson}
        />
      ) : (
        <button type="button" data-testid="open-step-lesson" onClick={() => setLessonOpen(true)}>
          Why it matters
        </button>
      )}
      {(step.lessonSeen || !lessonOpen) && (
        <>
          <label className="protocol-editor">
            <span>{definition.input === 'text' ? 'Your answer' : 'Notes (optional)'}</span>
            <textarea
              data-testid="step-editor"
              value={draft.text}
              placeholder={definition.placeholder}
              rows={definition.input === 'text' ? 12 : 4}
              disabled={submit.pending}
              onChange={(event) => draft.change(event.target.value)}
            />
          </label>
          {definition.input === 'canvas' && (
            <p className="protocol-hint-text">
              Draw the design on the canvas; it is sent as a Design Export (graph, description and
              PNG).
            </p>
          )}
          {draft.saveError && <p role="alert">Draft not saved: {draft.saveError}</p>}
          {exportError && <p role="alert">{exportError}</p>}
          <p className="protocol-actions">
            <button type="button" data-testid="step-submit" disabled={busy} onClick={onSubmit}>
              Submit for feedback
            </button>{' '}
            <button
              type="button"
              data-testid="step-hint"
              disabled={busy || step.nextHintLevel === null}
              onClick={onHint}
            >
              {hintButtonLabel(step.nextHintLevel)}
            </button>
          </p>
          <CallStatus
            pending={submit.pending}
            error={submit.error}
            pendingLabel="Getting feedback on the step..."
            onCancel={submit.cancel}
          />
          <CallStatus
            pending={hint.pending}
            error={hint.error}
            pendingLabel="Preparing a Hint..."
            onCancel={hint.cancel}
          />
          {step.hints.length > 0 && (
            <section data-testid="hints">
              <h4>Hints</h4>
              <ol>
                {step.hints.map((given) => (
                  <li key={given.id} data-testid="hint" data-level={given.level}>
                    <strong>{hintLevelLabels[given.level]}:</strong> {given.hint}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <SubmissionHistory step={step.step} submissions={step.submissions} />
        </>
      )}
    </section>
  )
}

/**
 * A Design Exercise run through the Interview Protocol: the problem statement, every Protocol
 * Step in canonical order (locked ones shown, not selectable), the selected step's panel with
 * the Design Canvas for graph steps, and the final review once every active step was reviewed.
 */
export function ProtocolExerciseScreen({
  designExerciseId,
  onClose
}: {
  designExerciseId: number
  onClose: () => void
}) {
  const [view, setView] = useState<ProtocolExerciseView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProtocolStep | 'final_review' | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const review = useProtocolCall(setView)

  useEffect(() => {
    window.api
      .getProtocolExercise({ designExerciseId })
      .then((loaded) => {
        setView(loaded)
        setSelected(defaultStep(loaded))
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [designExerciseId])

  if (error)
    return (
      <p role="alert" className="protocol-status">
        {error}
      </p>
    )
  if (!view || !selected) return <p className="protocol-status">Loading the design exercise...</p>

  const step = selected === 'final_review' ? null : view.steps.find((s) => s.step === selected)!
  const canvas = step !== null && PROTOCOL_STEP_DEFINITIONS[step.step].input === 'canvas'

  return (
    <section className="protocol-screen" data-testid="protocol-exercise">
      <header className="protocol-header">
        <button type="button" onClick={onClose}>
          Back
        </button>
        <strong>{view.title}</strong>
        <span className="lesson-badge" data-testid="exercise-index">
          Exercise {view.exerciseIndex}
        </span>
      </header>
      <div className="protocol-body">
        <nav className="protocol-nav">
          <p className="protocol-statement" data-testid="problem-statement">
            {view.problemStatement}
          </p>
          <ol className="protocol-steps">
            {view.steps.map((s) => (
              <li key={s.step}>
                <button
                  type="button"
                  data-testid={`step-${s.step}`}
                  data-active={s.active}
                  aria-current={selected === s.step}
                  disabled={!s.active}
                  className={s.active ? 'protocol-step-active' : 'protocol-step-locked'}
                  onClick={() => setSelected(s.step)}
                >
                  <span>{stepTitle(s.step)}</span>
                  <small>{stepStatus(s)}</small>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                data-testid="step-final-review"
                aria-current={selected === 'final_review'}
                disabled={!view.canRequestFinalReview && !view.finalReview}
                onClick={() => setSelected('final_review')}
              >
                <span>Final review</span>
                <small>
                  {view.finalReview
                    ? 'Done'
                    : view.canRequestFinalReview
                      ? 'Ready'
                      : 'After every active step is reviewed'}
                </small>
              </button>
            </li>
          </ol>
        </nav>
        <div className={canvas ? 'protocol-main protocol-main-canvas' : 'protocol-main'}>
          {canvas && (
            <div className="protocol-canvas" data-testid="protocol-canvas">
              <DesignCanvas key={view.id} designExerciseId={view.id} onEditorChange={setEditor} />
            </div>
          )}
          <div className="protocol-panel">
            {step ? (
              <StepPanel
                key={step.step}
                view={view}
                step={step}
                editor={editor}
                onExercise={setView}
              />
            ) : (
              <section data-testid="final-review-panel">
                <p>
                  The final review compares your latest submission of each step with the Reference
                  Solution of the System Design Primer.
                </p>
                <p>
                  <button
                    type="button"
                    data-testid="request-final-review"
                    disabled={review.pending || !view.canRequestFinalReview}
                    onClick={() =>
                      review.run((requestId) =>
                        window.api.requestFinalReview({ requestId, designExerciseId: view.id })
                      )
                    }
                  >
                    {view.finalReview ? 'Review again' : 'Get the final review'}
                  </button>
                </p>
                <CallStatus
                  pending={review.pending}
                  error={review.error}
                  pendingLabel="Comparing your design with the Reference Solution..."
                  onCancel={review.cancel}
                />
                {view.finalReview && (
                  <FinalReviewPanel
                    review={view.finalReview}
                    referenceSolution={view.referenceSolution}
                  />
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
