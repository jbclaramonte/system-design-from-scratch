import { useEffect, useRef } from 'react'
import type { RoundResult } from '../../../shared/quiz'
import { formatPercent } from './progress'
import { QuestionFeedbackView } from './QuestionFeedbackView'

/** Results of a completed Round: score vs the Mastery Threshold, per-notion breakdown, answers. */
export function QuizResults({ result }: { result: RoundResult }) {
  const { round, masteryThreshold, notionScores, questions, skippedQuestionIds } = result
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section data-testid="quiz-results">
      <h2 ref={headingRef} tabIndex={-1}>
        Round {round.number}: {round.passed ? 'passed' : 'not passed yet'}
      </h2>
      <p data-testid="round-score" data-passed={String(round.passed)}>
        Score <strong>{formatPercent(round.scorePercent ?? 0)}</strong>, Mastery Threshold{' '}
        {formatPercent(masteryThreshold)}.
        {skippedQuestionIds.length > 0 &&
          ` ${skippedQuestionIds.length} question(s) not counted: no grader was available for them.`}
      </p>

      <h3>By notion</h3>
      <table data-testid="notion-scores" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left', paddingRight: 16 }}>
              Notion
            </th>
            <th scope="col" style={{ textAlign: 'right', paddingRight: 16 }}>
              Questions
            </th>
            <th scope="col" style={{ textAlign: 'right' }}>
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {notionScores.map((notion) => (
            <tr key={notion.id} data-missed={String(notion.missed)}>
              <th
                scope="row"
                lang="fr"
                style={{ textAlign: 'left', fontWeight: 'normal', paddingRight: 16 }}
              >
                {notion.title}
              </th>
              <td style={{ textAlign: 'right', paddingRight: 16 }}>
                {notion.earned}/{notion.questionCount}
              </td>
              <td style={{ textAlign: 'right', color: notion.missed ? '#b3261e' : '#1b7a3a' }}>
                {formatPercent(notion.scorePercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Answers</h3>
      <ol style={{ paddingLeft: 20 }}>
        {questions.map((feedback) => (
          <li key={feedback.questionId} style={{ marginBottom: 16 }}>
            <p lang="fr" style={{ fontWeight: 'bold', marginBottom: 4 }}>
              {feedback.prompt}
            </p>
            <QuestionFeedbackView feedback={feedback} />
          </li>
        ))}
      </ol>
    </section>
  )
}
