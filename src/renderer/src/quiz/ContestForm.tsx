import { useState } from 'react'
import {
  CONTEST_JUSTIFICATION_MAX_LENGTH,
  type FreeAnswerQuestionFeedback,
  type QuestionFeedback
} from '../../../shared/quiz'
import { submitOnModEnter } from './FreeAnswerForm'
import { GradingStatus } from './GradingStatus'
import './quiz.css'
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
      <div className="quiz-actions">
        <button type="button" data-testid="contest-grade" onClick={() => setOpen(true)}>
          Contest this grade
        </button>
      </div>
    )
  }

  return (
    <form
      className="card quiz-contest"
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
    >
      <div className="quiz-field">
        <label htmlFor={inputId}>
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
        />
      </div>
      <GradingStatus
        pending={pending}
        error={error}
        pendingLabel="Re-grading your answer…"
        failureHint="The first grade still stands: retry, or keep it."
        onCancel={cancel}
      />
      <div className="quiz-actions">
        <button
          type="submit"
          className="btn-primary"
          data-testid="send-contest"
          disabled={pending || empty}
        >
          Re-grade my answer
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)}>
          Keep this grade
        </button>
      </div>
    </form>
  )
}
