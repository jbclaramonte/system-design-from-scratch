import { useEffect, useRef, useState } from 'react'
import type { QuestionFeedback, RoundResult, RoundStart } from '../../../shared/quiz'
import { ContestForm } from './ContestForm'
import { errorMessage } from './errorMessage'
import { FreeAnswerForm } from './FreeAnswerForm'
import { QuestionDiagram } from './QuestionDiagram'
import { QuestionFeedbackView } from './QuestionFeedbackView'
import {
  allGradableAnswered,
  answeredPercent,
  nextQuestionIndex,
  postponedQuestions,
  toggleChoice
} from './progress'
import './quiz.css'

const typeLabels = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  scenario: 'Scenario',
  free_answer: 'Free answer'
} as const

/** The Round progress: where the learner is, and how much of the quiz is answered. */
function RoundProgress({
  label,
  position,
  answered,
  total
}: {
  label: string
  /** "Question 3 of 4", or null on the end screen. */
  position: string | null
  answered: number
  total: number
}) {
  const percent = answeredPercent(answered, total)
  return (
    <header className="quiz-progress">
      <div className="quiz-progress-head">
        <p className="label-caps">{label}</p>
        <p className="label-mono quiz-progress-count" data-testid="quiz-position">
          {position ?? `${answered} of ${total} answered`}
        </p>
      </div>
      <div
        className={`progress${percent === 100 ? ' progress-complete' : ''}`}
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </header>
  )
}

/**
 * Plays a Round one question at a time: answer, see the feedback right away, move on. Grading
 * happens in the main process (free answers through a Generation); the questions come without
 * their answer keys.
 */
export function QuizPlayer({
  start,
  onCompleted
}: {
  start: RoundStart
  onCompleted: (result: RoundResult) => void
}) {
  const { round, quiz } = start
  const [feedback, setFeedback] = useState(
    () => new Map(start.answered.map((answered) => [answered.questionId, answered]))
  )
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set())
  // The question whose feedback is on screen, until the learner moves on.
  const [reviewing, setReviewing] = useState<QuestionFeedback | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Free-answer texts not graded yet, kept when the learner answers later.
  const [drafts, setDrafts] = useState<ReadonlyMap<number, string>>(new Map())
  const setDraft = (questionId: number, text: string | null) =>
    setDrafts((previous) => {
      const next = new Map(previous)
      if (text === null) next.delete(questionId)
      else next.set(questionId, text)
      return next
    })

  const answered = new Set(feedback.keys())
  const index = reviewing
    ? quiz.questions.findIndex((q) => q.id === reviewing.questionId)
    : nextQuestionIndex(quiz.questions, answered, skipped)
  const question = quiz.questions[index]
  const done = question === undefined

  // Move the focus to the new question (or the end of the quiz) for keyboard and screen readers.
  useEffect(() => {
    headingRef.current?.focus()
  }, [question?.id, done])

  const showGraded = (graded: QuestionFeedback) => {
    setFeedback((previous) => new Map(previous).set(graded.questionId, graded))
    setReviewing(graded)
  }

  const submit = () => {
    if (!question || selected.length === 0) return
    setBusy(true)
    setError(null)
    window.api
      .submitAnswer({ roundId: round.id, questionId: question.id, answer: { selected } })
      .then((graded) => {
        showGraded(graded)
        setSelected([])
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setBusy(false))
  }

  const complete = () => {
    setBusy(true)
    setError(null)
    window.api
      .completeRound({ roundId: round.id })
      .then(onCompleted)
      .catch((reason: unknown) => {
        setError(errorMessage(reason))
        setBusy(false)
      })
  }

  const progressLabel = `Round ${round.number} · ${quiz.topicTitle}`

  const total = quiz.questions.length

  if (done) {
    const postponed = postponedQuestions(quiz.questions, answered, skipped)
    return (
      <section className="reading-column quiz-player" data-testid="quiz-player">
        <RoundProgress
          label={progressLabel}
          position={null}
          answered={answered.size}
          total={total}
        />
        <div className="card quiz-end">
          <h2 ref={headingRef} tabIndex={-1}>
            {postponed.length === 0
              ? 'All questions answered'
              : `${postponed.length} question(s) left to answer`}
          </h2>
          {postponed.length > 0 && (
            <>
              <p className="muted">Every question counts in the score.</p>
              <button
                data-testid="answer-postponed"
                onClick={() =>
                  setSkipped(
                    (previous) =>
                      new Set([...previous].filter((id) => !postponed.some((q) => q.id === id)))
                  )
                }
              >
                Answer them now
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="btn-primary"
            data-testid="complete-round"
            onClick={complete}
            disabled={busy || !allGradableAnswered(quiz.questions, answered)}
          >
            See results
          </button>
        </div>
      </section>
    )
  }

  const multiple = question.type === 'multiple_choice'

  return (
    <section className="reading-column quiz-player" data-testid="quiz-player">
      <RoundProgress
        label={progressLabel}
        position={`Question ${index + 1} of ${total}`}
        answered={answered.size}
        total={total}
      />
      <h2 className="label-caps quiz-kind" ref={headingRef} tabIndex={-1}>
        <span className="chip">{typeLabels[question.type]}</span>
        {multiple && <span className="quiz-kind-hint">Select every correct answer.</span>}
      </h2>
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
      {!question.gradable ? (
        <div className="quiz-stack">
          <p lang="fr" className="quiz-prompt">
            {question.prompt}
          </p>
          <p className="notice" data-testid="question-not-gradable">
            No grader is available for this question. It is not counted in this round.
          </p>
          <div className="quiz-actions">
            <button
              data-testid="skip-question"
              onClick={() => setSkipped((previous) => new Set(previous).add(question.id))}
            >
              Skip
            </button>
          </div>
        </div>
      ) : reviewing ? (
        <div className="quiz-stack">
          <p lang="fr" className="quiz-prompt">
            {question.prompt}
          </p>
          <div role="status">
            <QuestionFeedbackView feedback={reviewing} />
          </div>
          {reviewing.kind === 'free_answer' && reviewing.contestable && (
            <ContestForm
              key={reviewing.questionId}
              roundId={round.id}
              feedback={reviewing}
              onContested={showGraded}
            />
          )}
          <div className="quiz-actions">
            <button
              className="btn-primary"
              data-testid="next-question"
              onClick={() => setReviewing(null)}
              autoFocus
            >
              Next
            </button>
          </div>
        </div>
      ) : question.type === 'free_answer' ? (
        <FreeAnswerForm
          key={question.id}
          roundId={round.id}
          question={question}
          draft={drafts.get(question.id) ?? ''}
          onDraftChange={(text) => setDraft(question.id, text)}
          onGraded={(graded) => {
            setDraft(question.id, null)
            showGraded(graded)
          }}
          onAnswerLater={() => setSkipped((previous) => new Set(previous).add(question.id))}
        />
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
            {question.choices.map((choice, choiceIndex) => (
              <label key={choiceIndex} lang="fr" className="quiz-choice">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={`question-${question.id}`}
                  data-testid={`choice-${choiceIndex}`}
                  checked={selected.includes(choiceIndex)}
                  onChange={() =>
                    setSelected((previous) => toggleChoice(previous, choiceIndex, multiple))
                  }
                />
                <span>{choice}</span>
              </label>
            ))}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="quiz-actions">
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
