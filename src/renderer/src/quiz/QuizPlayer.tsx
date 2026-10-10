import { useEffect, useRef, useState } from 'react'
import type { QuestionFeedback, RoundResult, RoundStart } from '../../../shared/quiz'
import { ContestForm } from './ContestForm'
import { errorMessage } from './errorMessage'
import { FreeAnswerForm } from './FreeAnswerForm'
import { QuestionDiagram } from './QuestionDiagram'
import { QuestionFeedbackView } from './QuestionFeedbackView'
import {
  allGradableAnswered,
  nextQuestionIndex,
  postponedQuestions,
  toggleChoice
} from './progress'

const typeLabels = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice: select every correct answer',
  scenario: 'Scenario',
  free_answer: 'Free answer'
} as const

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

  const progress = `Round ${round.number} · ${quiz.topicTitle}`

  if (done) {
    const postponed = postponedQuestions(quiz.questions, answered, skipped)
    return (
      <section data-testid="quiz-player">
        <p>{progress}</p>
        <h2 ref={headingRef} tabIndex={-1}>
          {postponed.length === 0
            ? 'All questions answered'
            : `${postponed.length} question(s) left to answer`}
        </h2>
        {postponed.length > 0 && (
          <p>
            Every question counts in the score.{' '}
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
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          data-testid="complete-round"
          onClick={complete}
          disabled={busy || !allGradableAnswered(quiz.questions, answered)}
        >
          See results
        </button>
      </section>
    )
  }

  const multiple = question.type === 'multiple_choice'

  return (
    <section data-testid="quiz-player">
      <p>
        {progress} · Question {index + 1} of {quiz.questions.length}
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        style={{ fontSize: '1.1em', color: 'var(--color-text-secondary)' }}
      >
        {typeLabels[question.type]}
      </h2>
      {question.scenario && (
        <p
          lang="fr"
          data-testid="question-scenario"
          style={{ background: 'var(--color-surface-elevated)', padding: '8px 12px' }}
        >
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
        <>
          <p lang="fr" style={{ fontSize: '1.15em' }}>
            {question.prompt}
          </p>
          <p data-testid="question-not-gradable">
            No grader is available for this question. It is not counted in this round.
          </p>
          <button
            data-testid="skip-question"
            onClick={() => setSkipped((previous) => new Set(previous).add(question.id))}
          >
            Skip
          </button>
        </>
      ) : reviewing ? (
        <>
          <p lang="fr" style={{ fontSize: '1.15em' }}>
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
          <p>
            <button data-testid="next-question" onClick={() => setReviewing(null)} autoFocus>
              Next
            </button>
          </p>
        </>
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
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }} disabled={busy}>
            <legend lang="fr" style={{ fontSize: '1.15em', marginBottom: 8 }}>
              {question.prompt}
            </legend>
            {question.choices.map((choice, choiceIndex) => (
              <label
                key={choiceIndex}
                lang="fr"
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  padding: '6px 8px',
                  marginBottom: 4,
                  border: '1px solid var(--color-border-control)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer'
                }}
              >
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
          <p>
            <button
              type="submit"
              data-testid="submit-answer"
              disabled={busy || selected.length === 0}
            >
              Check answer
            </button>
          </p>
        </form>
      )}
    </section>
  )
}
