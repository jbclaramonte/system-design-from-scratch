import type { AttemptResult, QuestionFeedback } from '../../../shared/quiz'
import { formatPercent } from './progress'

const resultLabels: Record<AttemptResult, string> = {
  correct: 'Correct',
  partially_correct: 'Partially correct',
  incorrect: 'Incorrect'
}

const resultColors: Record<AttemptResult, string> = {
  correct: '#1b7a3a',
  partially_correct: '#a35c00',
  incorrect: '#b3261e'
}

/** Feedback on an answered question: result, every choice marked, and the stored explanation. */
export function QuestionFeedbackView({ feedback }: { feedback: QuestionFeedback }) {
  return (
    <div data-testid="question-feedback" data-result={feedback.result}>
      <p style={{ fontWeight: 'bold', color: resultColors[feedback.result] }}>
        {resultLabels[feedback.result]}
        {feedback.partialCredit !== null && feedback.result === 'partially_correct' && (
          <span style={{ fontWeight: 'normal' }}>
            {' '}
            ({formatPercent(Math.round(feedback.partialCredit * 100))} of the way: a multiple-choice
            question only counts when every correct choice and no wrong one is selected)
          </span>
        )}
      </p>
      <ul lang="fr" style={{ paddingLeft: 0, listStyle: 'none' }}>
        {feedback.choices.map((choice, index) => (
          <li
            key={index}
            style={{
              padding: '4px 8px',
              marginBottom: 4,
              borderLeft: `4px solid ${choice.correct ? resultColors.correct : 'transparent'}`,
              background: choice.selected && !choice.correct ? '#fdecea' : undefined
            }}
          >
            <span aria-hidden="true">{choice.correct ? '✓ ' : choice.selected ? '✗ ' : '  '}</span>
            {choice.text}
            <span style={{ fontSize: '0.85em', color: '#555' }}>
              {choice.correct && ' (correct answer)'}
              {choice.selected && ' (your answer)'}
            </span>
          </li>
        ))}
      </ul>
      <div lang="fr" style={{ background: '#f4f6f8', padding: '8px 12px' }}>
        <strong lang="en">{feedback.type === 'scenario' ? 'Trade-off' : 'Explanation'}: </strong>
        {feedback.explanation}
      </div>
    </div>
  )
}
