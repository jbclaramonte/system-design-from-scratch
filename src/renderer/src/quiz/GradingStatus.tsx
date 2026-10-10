import { GenerationErrorView } from '../generation/GenerationErrorView'
import './quiz.css'
import type { GradingError } from './useGrading'

/** Pending state (with Cancel) or the error of a free-answer grading, with what to do next. */
export function GradingStatus({
  pending,
  error,
  pendingLabel,
  failureHint,
  onCancel
}: {
  pending: boolean
  error: GradingError | null
  pendingLabel: string
  /** What the learner can do after a failed Generation. */
  failureHint: string
  onCancel: () => void
}) {
  if (pending) {
    return (
      <p className="quiz-pending" role="status" data-testid="grading-pending">
        <span className="quiz-pending-dot" aria-hidden="true" />
        <span className="quiz-pending-text">{pendingLabel}</span>
        <button type="button" className="btn-sm" data-testid="cancel-grading" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  }
  if (!error) return null
  if (error.code === 'cancelled') {
    return (
      <p className="quiz-notice" role="status" data-testid="grading-error" data-code={error.code}>
        Grading cancelled. Your text is kept.
      </p>
    )
  }
  return (
    <GenerationErrorView
      code={error.code}
      message={error.message}
      hint={error.code !== 'refused' ? failureHint : undefined}
      testId="grading-error"
    />
  )
}
