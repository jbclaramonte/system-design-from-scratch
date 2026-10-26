import { useEffect, useRef } from 'react'
import type { RecallResult } from '../../../shared/recall'
import { QuestionFeedbackView } from '../quiz/QuestionFeedbackView'
import '../quiz/quiz.css'
import './recall.css'
import { notionOutcomeMark, scoreSummaryText } from './recallText'

const typeLabels = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  scenario: 'Scenario',
  free_answer: 'Free answer'
} as const

/**
 * What the Recall Quiz showed: a count, how each Notion went (a glyph and a word, honey for a
 * miss), and the answers. No pass or fail, no Mastery Threshold, no XP: the Lesson always opens.
 */
export function RecallResults({
  result,
  onContinue
}: {
  result: RecallResult
  onContinue: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { questions, notionOutcomes } = result
  const correct = questions.filter((question) => question.result === 'correct').length

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section className="reading-column quiz-results recall" data-testid="recall-results">
      <header className="quiz-results-head">
        <span className="chip">Recall</span>
        <h2 className="quiz-results-title" ref={headingRef} tabIndex={-1}>
          Recall Quiz complete
        </h2>
        <p data-testid="recall-summary">{scoreSummaryText(correct, questions.length)}</p>
        <div className="quiz-actions">
          <button
            type="button"
            className="btn-primary"
            data-testid="recall-continue"
            onClick={onContinue}
          >
            Continue to the Lesson
          </button>
        </div>
      </header>

      {notionOutcomes.length > 0 && (
        <section className="quiz-stack" aria-labelledby="recall-by-notion">
          <h3 id="recall-by-notion">By notion</h3>
          <ul className="quiz-marks" data-testid="recall-notions">
            {notionOutcomes.map(({ notion, correct: right, asked }) => {
              const mark = notionOutcomeMark(right, asked)
              return (
                <li
                  key={notion.id}
                  className={`mark-row mark-row-${mark.tone}`}
                  data-outcome={mark.tone}
                >
                  <span className="mark-row-glyph" aria-hidden="true">
                    {mark.glyph}
                  </span>
                  <span className="mark-row-text" lang="fr">
                    {notion.title}
                  </span>
                  <span className="mark-row-chips" lang="en">
                    <span className="label-mono">
                      {right}/{asked}
                    </span>
                    <span className={`chip chip-${mark.tone}`}>{mark.label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="quiz-stack" aria-labelledby="recall-answers">
        <h3 id="recall-answers">Answers</h3>
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
