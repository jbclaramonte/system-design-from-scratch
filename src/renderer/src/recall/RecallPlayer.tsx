import { useEffect, useRef, useState } from 'react'
import type { QuestionFeedback } from '../../../shared/quiz'
import type { RecallResult, RecallStart } from '../../../shared/recall'
import { useHoldUpdateBanner } from '../update/UpdateProvider'
import { ClarifyQuestion } from '../quiz/ClarifyQuestion'
import { errorMessage } from '../quiz/errorMessage'
import { QuestionDiagram } from '../quiz/QuestionDiagram'
import { QuestionFeedbackView } from '../quiz/QuestionFeedbackView'
import { answeredPercent, toggleChoice } from '../quiz/progress'
import '../quiz/quiz.css'
import './recall.css'
import { oftenMissedText, progressText, subtitleText } from './recallText'

const typeLabels = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  scenario: 'Scenario',
  free_answer: 'Free answer'
} as const

/**
 * Plays a Recall Quiz one question at a time: answer, see the feedback right away, move on. There
 * is no skip: the quiz is always taken, but it never blocks the Lesson. Every answer is graded
 * locally. No XP, no celebration: a Recall Quiz has no consequence on the score of a Topic.
 * `onGiveUp` is only offered after a technical failure, so the learner is never stuck.
 */
export function RecallPlayer({
  start,
  onCompleted,
  onGiveUp
}: {
  start: RecallStart
  onCompleted: (result: RecallResult) => void
  /** The "Continue to the Lesson" fallback after a failed answer or completion. */
  onGiveUp: () => void
}) {
  const { session, questions } = start
  // An install prompt never interrupts a quiz.
  useHoldUpdateBanner()
  const [feedback, setFeedback] = useState(
    () => new Map(start.answered.map((answered) => [answered.questionId, answered]))
  )
  // The question the learner went back to; null follows the first unanswered one.
  const [cursor, setCursor] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const total = questions.length
  const firstUnanswered = questions.findIndex((q) => !feedback.has(q.id))
  const next = firstUnanswered === -1 ? total : firstUnanswered
  const index = cursor ?? next
  const question = questions[index]
  const done = question === undefined
  const answeredFeedback = question ? feedback.get(question.id) : undefined

  // Move the focus to the new question (or the end of the quiz) for keyboard and screen readers.
  useEffect(() => {
    headingRef.current?.focus()
  }, [question?.id, done])

  /** Shows the question at `target`; the first unanswered one is the default. */
  const go = (target: number) => {
    setError(null)
    setSelected([])
    setCursor(target >= next ? null : target)
  }

  const submit = () => {
    if (!question || selected.length === 0) return
    setBusy(true)
    setError(null)
    window.api
      .submitRecallAnswer({
        sessionId: session.id,
        questionId: question.id,
        answer: { selected }
      })
      .then((graded: QuestionFeedback) => {
        setFeedback((previous) => new Map(previous).set(graded.questionId, graded))
        setCursor(index)
        setSelected([])
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setBusy(false))
  }

  const complete = () => {
    setBusy(true)
    setError(null)
    window.api
      .completeRecall({ sessionId: session.id })
      .then(onCompleted)
      .catch((reason: unknown) => {
        setError(errorMessage(reason))
        setBusy(false)
      })
  }

  const answeredCount = feedback.size
  const percent = answeredPercent(answeredCount, total)
  const header = (
    <header className="quiz-progress recall-head">
      <div className="quiz-progress-head">
        <span className="chip">Recall</span>
        <p className="label-mono quiz-progress-count" data-testid="recall-position">
          {done ? `${answeredCount} of ${total} answered` : progressText(index + 1, total)}
        </p>
      </div>
      <p className="muted" data-testid="recall-subtitle">
        {subtitleText()}
      </p>
      <div
        className={`progress${percent === 100 ? ' progress-complete' : ''}`}
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answeredCount}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </header>
  )

  /** The message of a failure, with the way out: the Lesson never waits on a technical problem. */
  const failure = error && (
    <div className="notice notice-attention recall-failure" role="alert" data-testid="recall-error">
      <p>{error}</p>
      <p>This does not affect your progress. You can try again, or go on to the Lesson.</p>
      <button type="button" data-testid="recall-give-up" onClick={onGiveUp}>
        Continue to the Lesson
      </button>
    </div>
  )

  if (done) {
    return (
      <section className="reading-column quiz-player recall" data-testid="recall-player">
        {header}
        <div className="card quiz-end">
          <h2 ref={headingRef} tabIndex={-1}>
            All questions answered
          </h2>
          {failure}
          <button
            type="button"
            className="btn-primary"
            data-testid="recall-complete"
            onClick={complete}
            disabled={busy}
          >
            See results
          </button>
        </div>
      </section>
    )
  }

  const multiple = question.type === 'multiple_choice'
  const isLast = index === total - 1
  const previous = index > 0 && (
    <button
      type="button"
      data-testid="recall-previous"
      aria-label="Previous question"
      disabled={busy}
      onClick={() => go(index - 1)}
    >
      Previous
    </button>
  )

  return (
    <section className="reading-column quiz-player recall" data-testid="recall-player">
      {header}
      <h2 className="label-caps quiz-kind" ref={headingRef} tabIndex={-1}>
        <span className="chip">{typeLabels[question.type]}</span>
        {multiple && <span className="quiz-kind-hint">Select every correct answer.</span>}
      </h2>
      {question.recallHint && (
        <p className="recall-tag" data-testid="recall-often-missed">
          <span className="chip chip-attention">
            <span aria-hidden="true">!</span>
            Often missed
          </span>
          <span className="recall-tag-count">
            {oftenMissedText(question.recallHint.missed, question.recallHint.of)}
          </span>
        </p>
      )}
      {question.scenario && (
        <p lang="fr" className="card quiz-scenario" data-testid="question-scenario">
          {question.scenario}
        </p>
      )}
      {question.diagram && (
        <QuestionDiagram
          key={question.id}
          questionId={question.id}
          source={question.diagram}
          title={question.prompt}
        />
      )}
      {answeredFeedback ? (
        <div className="quiz-stack">
          <p lang="fr" className="quiz-prompt">
            {question.prompt}
          </p>
          <div role="status">
            <QuestionFeedbackView feedback={answeredFeedback} />
          </div>
          {failure}
          <div className="quiz-actions">
            {previous}
            {isLast ? (
              <button
                type="button"
                className="btn-primary"
                data-testid="recall-complete"
                disabled={busy}
                onClick={complete}
                autoFocus
              >
                See results
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                data-testid="next-question"
                onClick={() => go(index + 1)}
                autoFocus
              >
                Next
              </button>
            )}
          </div>
        </div>
      ) : (
        <form
          className="quiz-stack"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <fieldset className="quiz-choices" disabled={busy}>
            <legend lang="fr" className="quiz-prompt">
              {question.prompt}
            </legend>
            <ClarifyQuestion
              key={question.id}
              target={{ kind: 'recall', sessionId: session.id }}
              questionId={question.id}
            />
            {question.choices.map((choice, choiceIndex) => (
              <label key={choiceIndex} lang="fr" className="quiz-choice">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={`recall-question-${question.id}`}
                  data-testid={`choice-${choiceIndex}`}
                  checked={selected.includes(choiceIndex)}
                  onChange={() =>
                    setSelected((current) => toggleChoice(current, choiceIndex, multiple))
                  }
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          {failure}
          <div className="quiz-actions">
            {previous}
            <button
              type="submit"
              className="btn-primary"
              data-testid="submit-answer"
              disabled={busy || selected.length === 0}
            >
              Check answer
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
