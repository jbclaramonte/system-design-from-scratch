import { useEffect, useRef } from 'react'
import type { RoundResult } from '../../../shared/quiz'
import { OutsidePrimerBadge } from '../lesson/OutsidePrimerBadge'
import { formatPercent } from './progress'
import { QuestionFeedbackView } from './QuestionFeedbackView'
import './quiz.css'

const typeLabels = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  scenario: 'Scenario',
  free_answer: 'Free answer'
} as const

/**
 * Results of a completed Round: score vs the Mastery Threshold, per-notion breakdown, answers.
 * `outsidePrimer` flags an ungrounded quiz (Foundations Module).
 */
export function QuizResults({
  result,
  outsidePrimer = false
}: {
  result: RoundResult
  outsidePrimer?: boolean
}) {
  const { round, masteryThreshold, notionScores, questions, skippedQuestionIds } = result
  const headingRef = useRef<HTMLHeadingElement>(null)
  const score = round.scorePercent ?? 0
  const passed = round.passed === true

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="reading-column quiz-results" data-testid="quiz-results">
      <header className="quiz-results-head">
        <h2 className="quiz-results-title" ref={headingRef} tabIndex={-1}>
          Round {round.number}
          <span className="visually-hidden">: </span>
          <span className={`chip chip-dot ${passed ? 'chip-mastered' : 'chip-attention'}`}>
            {passed ? 'passed' : 'not passed yet'}
          </span>
        </h2>
        {outsidePrimer && (
          <p className="muted">
            <OutsidePrimerBadge testId="quiz-results-ungrounded" /> Questions and answer keys were
            generated from general knowledge, not checked against the primer.
          </p>
        )}
      </header>

      <div
        className="card card-elevated quiz-score"
        data-testid="round-score"
        data-passed={String(round.passed)}
      >
        <div className="quiz-score-figures">
          <p className="stat stat-xl">
            <span className="label-caps">Score</span>
            <strong className="stat-value">{formatPercent(score)}</strong>
          </p>
          <p className="stat quiz-score-figure-end">
            <span className="label-caps">Mastery Threshold</span>
            <strong className="quiz-score-threshold label-mono">
              {formatPercent(masteryThreshold)}
            </strong>
          </p>
        </div>
        <div className="quiz-score-bar" aria-hidden="true">
          <div className={`progress${passed ? ' progress-complete' : ''}`}>
            <div className="progress-fill" style={{ width: `${Math.min(100, score)}%` }} />
          </div>
          <span
            className="quiz-score-marker"
            style={{ left: `${Math.min(100, masteryThreshold)}%` }}
          />
        </div>
        {skippedQuestionIds.length > 0 && (
          <p className="quiz-score-note">
            {skippedQuestionIds.length} question(s) not counted: no grader was available for them.
          </p>
        )}
      </div>

      <section className="quiz-stack" aria-labelledby="quiz-by-notion">
        <h3 id="quiz-by-notion">By notion</h3>
        <div className="card card-flush quiz-notions">
          <table className="card-table" data-testid="notion-scores">
            <thead>
              <tr>
                <th scope="col">Notion</th>
                <th scope="col" className="quiz-num">
                  Questions
                </th>
                <th scope="col" className="quiz-num">
                  Score
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {notionScores.map((notion) => (
                <tr key={notion.id} data-missed={String(notion.missed)}>
                  <th scope="row" lang="fr">
                    {notion.title}
                  </th>
                  <td className="quiz-num">
                    {notion.earned}/{notion.questionCount}
                  </td>
                  <td className="quiz-num">{formatPercent(notion.scorePercent)}</td>
                  <td>
                    <span className={`chip ${notion.missed ? 'chip-attention' : 'chip-mastered'}`}>
                      {notion.missed ? 'Missed' : 'All correct'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quiz-stack" aria-labelledby="quiz-answers">
        <h3 id="quiz-answers">Answers</h3>
        <ol className="quiz-answers">
          {questions.map((feedback, index) => (
            <li key={feedback.questionId} className="card quiz-answer-item">
              <div className="quiz-answer-head">
                <span className="label-caps">Question {index + 1}</span>
                <span className="chip">{typeLabels[feedback.type]}</span>
              </div>
              <p lang="fr" className="quiz-prompt">
                {feedback.prompt}
              </p>
              <QuestionFeedbackView feedback={feedback} />
            </li>
          ))}
        </ol>
      </section>
    </section>
  )
}
