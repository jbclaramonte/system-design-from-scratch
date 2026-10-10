import { useState } from 'react'
import {
  CONTEST_JUSTIFICATION_MAX_LENGTH,
  type FreeAnswerQuestionFeedback,
  type QuestionFeedback
} from '../../../shared/quiz'
import { submitOnModEnter } from './FreeAnswerForm'
import { GradingStatus } from './GradingStatus'
import { useGrading } from './useGrading'

/**
 * Contest a free-answer grade, once per question: the answer is re-graded with the learner's
 * justification, and the new grade replaces the first (kept in the Attempt's history).
 */
export function ContestForm({
  roundId,
  feedback,
  onContested
}: {
  roundId: number
  feedback: FreeAnswerQuestionFeedback
  onContested: (feedback: QuestionFeedback) => void
}) {
  const [open, setOpen] = useState(false)
  const [justification, setJustification] = useState('')
  const { pending, error, run, cancel } = useGrading(roundId, feedback.questionId)
  const empty = justification.trim().length === 0
  const inputId = `contest-${feedback.questionId}`

  if (!open) {
    return (
      <p>
        <button type="button" data-testid="contest-grade" onClick={() => setOpen(true)}>
          Contest this grade
        </button>
      </p>
    )
  }

  return (
    <form
      data-testid="contest-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (empty) return
        run(
          () =>
            window.api.contestGrade({
              roundId,
              questionId: feedback.questionId,
              justification
            }),
          onContested
        )
      }}
      style={{
        border: '1px solid var(--color-border-control)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        margin: '8px 0'
      }}
    >
      <label htmlFor={inputId} style={{ display: 'block' }}>
        Why is this grade wrong? Point at what your answer already says: your answer is re-graded
        once with this justification, and the new grade replaces this one. Ctrl+Enter (⌘+Enter) to
        send.
      </label>
      <textarea
        id={inputId}
        data-testid="contest-justification"
        lang="fr"
        rows={3}
        maxLength={CONTEST_JUSTIFICATION_MAX_LENGTH}
        value={justification}
        readOnly={pending}
        onChange={(event) => setJustification(event.target.value)}
        onKeyDown={submitOnModEnter}
        autoFocus
        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', padding: 8 }}
      />
      <GradingStatus
        pending={pending}
        error={error}
        pendingLabel="Re-grading your answer…"
        failureHint="The first grade still stands: retry, or keep it."
        onCancel={cancel}
      />
      <p style={{ display: 'flex', gap: 8, marginBottom: 0 }}>
        <button type="submit" data-testid="send-contest" disabled={pending || empty}>
          Re-grade my answer
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>
          Keep this grade
        </button>
      </p>
    </form>
  )
}
