import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
  PROTOCOL_STEP_DEFINITIONS,
  protocolSteps,
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
  chipClass,
  defaultStep,
  finalReviewState,
  hintButtonLabel,
  hintLevelLabels,
  progressLabel,
  reviewProgress,
  stepState,
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
  const state = stepState(step)
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
      <header className="protocol-step-header">
        <p className="protocol-step-chips">
          <span className="label-mono faint">
            Step {protocolSteps.indexOf(step.step) + 1} of {protocolSteps.length}
          </span>
          <span className={chipClass(state.chip)}>{state.label}</span>
          {step.isNew && <span className="chip chip-progress">New in this exercise</span>}
          <span className="chip">{definition.input === 'canvas' ? 'Design Canvas' : 'Text'}</span>
        </p>
        <h2>{definition.title}</h2>
        <p className="protocol-goal">{definition.goal}</p>
      </header>
      {lessonOpen ? (
        <StepLesson
          step={step.step}
          closeLabel={step.lessonSeen ? 'Close' : 'Got it, start the step'}
          onClose={closeLesson}
        />
      ) : (
        <p>
          <button
            type="button"
            className="btn-sm"
            data-testid="open-step-lesson"
            onClick={() => setLessonOpen(true)}
          >
            Why it matters
          </button>
        </p>
      )}
      {(step.lessonSeen || !lessonOpen) && (
        <>
          <label className="protocol-editor">
            <span className="label-caps">
              {definition.input === 'text' ? 'Your answer' : 'Notes (optional)'}
            </span>
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
          {draft.saveError && (
            <p role="alert" className="protocol-notice protocol-notice-error">
              Draft not saved: {draft.saveError}
            </p>
          )}
          {exportError && (
            <p role="alert" className="protocol-notice protocol-notice-error">
              {exportError}
            </p>
          )}
          <p className="protocol-actions">
            <button
              type="button"
              className="btn-primary"
              data-testid="step-submit"
              disabled={busy}
              onClick={onSubmit}
            >
              Submit for feedback
            </button>
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
            <section className="protocol-section" data-testid="hints">
              <h3 className="label-caps">Hints</h3>
              <ol className="protocol-hints">
                {step.hints.map((given) => (
                  <li
                    key={given.id}
                    className="protocol-hint card"
                    data-testid="hint"
                    data-level={given.level}
                  >
                    <span className="chip chip-progress chip-dot">
                      Hint {given.level} <span aria-hidden>·</span> {hintLevelLabels[given.level]}
                    </span>
                    <p>{given.hint}</p>
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
  const progress = reviewProgress(view)
  const finalState = finalReviewState(view)
  const finalAvailable = view.canRequestFinalReview || view.finalReview !== null

  return (
    <section className="protocol-screen" data-testid="protocol-exercise">
      <header className="protocol-header">
        <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
          <span aria-hidden>←</span> Back
        </button>
        <div className="protocol-title">
          <h1>{view.title}</h1>
        </div>
        <span className="chip chip-progress" data-testid="exercise-index">
          Exercise {view.exerciseIndex}
        </span>
        <div className="protocol-progress" data-testid="protocol-progress">
          <span className="label-mono">{progressLabel(progress)}</span>
          <div
            className={
              progress.total > 0 && progress.reviewed === progress.total
                ? 'progress progress-complete'
                : 'progress'
            }
            role="presentation"
          >
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </header>
      <div className="protocol-body">
        <nav className="protocol-nav" aria-label="Protocol Steps">
          <div className="protocol-statement-card card">
            <p className="label-caps">Problem statement</p>
            <p className="protocol-statement" data-testid="problem-statement">
              {view.problemStatement}
            </p>
          </div>
          <ol className="protocol-steps">
            {view.steps.map((s, index) => {
              const state = stepState(s)
              return (
                <li key={s.step}>
                  <button
                    type="button"
                    data-testid={`step-${s.step}`}
                    data-active={s.active}
                    data-state={state.kind}
                    aria-current={selected === s.step}
                    disabled={!s.active}
                    className={`protocol-step-card card card-interactive ${
                      s.active ? 'protocol-step-active' : 'protocol-step-locked'
                    }`}
                    onClick={() => setSelected(s.step)}
                  >
                    <span className="protocol-step-top">
                      <span className="label-mono faint">{String(index + 1).padStart(2, '0')}</span>
                      <span className={chipClass(state.chip)}>{state.label}</span>
                    </span>
                    <span className="protocol-step-title">{stepTitle(s.step)}</span>
                    <span className="protocol-step-detail">{state.detail}</span>
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                data-testid="step-final-review"
                data-state={finalState.kind}
                aria-current={selected === 'final_review'}
                disabled={!finalAvailable}
                className={`protocol-step-card card card-interactive ${
                  finalAvailable ? 'protocol-step-active' : 'protocol-step-locked'
                }`}
                onClick={() => setSelected('final_review')}
              >
                <span className="protocol-step-top">
                  <span className="label-mono faint">
                    {String(view.steps.length + 1).padStart(2, '0')}
                  </span>
                  <span className={chipClass(finalState.chip)}>{finalState.label}</span>
                </span>
                <span className="protocol-step-title">Final review</span>
                <span className="protocol-step-detail">{finalState.detail}</span>
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
          <div className="protocol-panel" key={selected}>
            <div className="protocol-panel-inner">
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
                  <header className="protocol-step-header">
                    <p className="protocol-step-chips">
                      <span className={chipClass(finalState.chip)}>{finalState.label}</span>
                    </p>
                    <h2>Final review</h2>
                    <p className="protocol-goal">
                      The final review compares your latest submission of each step with the
                      Reference Solution of the System Design Primer.
                    </p>
                  </header>
                  <p className="protocol-actions">
                    <button
                      type="button"
                      className="btn-primary"
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
      </div>
    </section>
  )
}
