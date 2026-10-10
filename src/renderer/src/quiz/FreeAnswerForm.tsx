import { useState } from 'react'
import {
  FREE_ANSWER_MAX_LENGTH,
  type QuestionFeedback,
  type QuestionView
} from '../../../shared/quiz'
import { GradingStatus } from './GradingStatus'
import './quiz.css'
import { useGrading } from './useGrading'

/** Ctrl+Enter (Cmd+Enter on macOS) sends a text area's form; Enter alone adds a line. */
export function submitOnModEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }
}

/**
 * A free-answer question: a short text graded by a Generation in the main process. While it is
 * graded the learner can cancel; on a failure nothing is recorded and they can retry or answer
 * later. The model answer only arrives with the grading.
 */
export function FreeAnswerForm({
  roundId,
  question,
  draft,
  onDraftChange,
  onGraded,
  onAnswerLater
}: {
  roundId: number
  question: QuestionView
  draft: string
  onDraftChange: (text: string) => void
  onGraded: (feedback: QuestionFeedback) => void
  onAnswerLater: () => void
}) {
  const [text, setText] = useState(draft)
  const { pending, error, run, cancel } = useGrading(roundId, question.id)
  const empty = text.trim().length === 0
  const inputId = `free-answer-${question.id}`

  const submit = () => {
    if (empty) return
    run(
      () => window.api.submitFreeAnswer({ roundId, questionId: question.id, answer: { text } }),
      onGraded
    )
  }

  return (
    <form
      className="quiz-stack"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="quiz-field">
        <label htmlFor={inputId} lang="fr" className="quiz-prompt">
          {question.prompt}
        </label>
        <p id={`${inputId}-hint`} className="muted">
          Answer in one to a few sentences, in your own words. Ctrl+Enter (⌘+Enter) to send.
        </p>
        <textarea
          id={inputId}
          data-testid="free-answer-text"
          lang="fr"
          rows={5}
          maxLength={FREE_ANSWER_MAX_LENGTH}
          value={text}
          readOnly={pending}
          aria-describedby={`${inputId}-hint ${inputId}-count`}
          onChange={(event) => {
            setText(event.target.value)
            onDraftChange(event.target.value)
          }}
          onKeyDown={submitOnModEnter}
        />
        <p id={`${inputId}-count`} className="quiz-field-foot label-mono">
          {text.length}/{FREE_ANSWER_MAX_LENGTH}
        </p>
      </div>
      <GradingStatus
        pending={pending}
        error={error}
        pendingLabel="Grading your answer (a few seconds)…"
        failureHint="Nothing was recorded: retry, or answer later."
        onCancel={cancel}
      />
      <div className="quiz-actions">
        <button
          type="submit"
          className="btn-primary"
          data-testid="submit-answer"
          disabled={pending || empty}
        >
          {error && error.code !== 'cancelled' && error.code !== 'refused'
            ? 'Retry'
            : 'Check answer'}
        </button>
        <button type="button" data-testid="answer-later" disabled={pending} onClick={onAnswerLater}>
          Answer later
        </button>
      </div>
    </form>
  )
}
