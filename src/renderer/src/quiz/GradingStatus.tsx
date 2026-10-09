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
      <p role="status" data-testid="grading-pending">
        {pendingLabel}{' '}
        <button type="button" data-testid="cancel-grading" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  }
  if (!error) return null
  if (error.code === 'cancelled') {
    return (
      <p role="status" data-testid="grading-error" data-code={error.code}>
        Grading cancelled. Your text is kept.
      </p>
    )
  }
  return (
    <p role="alert" data-testid="grading-error" data-code={error.code}>
      {error.message}
      {error.code !== 'refused' && ` ${failureHint}`}
    </p>
  )
}
