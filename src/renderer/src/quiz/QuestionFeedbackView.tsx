import type {
  AttemptResult,
  ChoiceQuestionFeedback,
  ExpectedPointFeedback,
  FreeAnswerQuestionFeedback,
  QuestionFeedback
} from '../../../shared/quiz'
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

/** Feedback on an answered question: result, then the details of its kind. */
export function QuestionFeedbackView({ feedback }: { feedback: QuestionFeedback }) {
  return feedback.kind === 'free_answer' ? (
    <FreeAnswerFeedbackView feedback={feedback} />
  ) : (
    <ChoiceFeedbackView feedback={feedback} />
  )
}

/** A choice question: every choice marked, and the stored explanation. */
function ChoiceFeedbackView({ feedback }: { feedback: ChoiceQuestionFeedback }) {
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

const boxStyle = { background: '#f4f6f8', padding: '8px 12px', marginBottom: 8 }

function ExpectedPoints({ points }: { points: ExpectedPointFeedback[] }) {
  return (
    <ul lang="fr" style={{ paddingLeft: 0, listStyle: 'none' }}>
      {points.map((point, index) => (
        <li
          key={index}
          data-covered={String(point.covered)}
          style={{
            padding: '4px 8px',
            marginBottom: 4,
            borderLeft: `4px solid ${point.covered ? resultColors.correct : resultColors.incorrect}`
          }}
        >
          <span aria-hidden="true">{point.covered ? '✓ ' : '✗ '}</span>
          <strong>{point.point}</strong>
          <span lang="en" style={{ fontSize: '0.85em', color: '#555' }}>
            {point.covered ? ' (covered)' : ' (missing)'}
          </span>
          <br />
          {point.justification}
        </li>
      ))}
    </ul>
  )
}

/**
 * A free answer graded by a Generation: verdict, the learner's answer, each expected point
 * covered or missing, misconceptions, explanation, what to review, then the model answer.
 */
function FreeAnswerFeedbackView({ feedback }: { feedback: FreeAnswerQuestionFeedback }) {
  const covered = feedback.expectedPoints.filter((point) => point.covered).length
  return (
    <div data-testid="question-feedback" data-result={feedback.result} data-kind="free_answer">
      <p style={{ fontWeight: 'bold', color: resultColors[feedback.result] }}>
        {resultLabels[feedback.result]}
        {feedback.result === 'partially_correct' && (
          <span style={{ fontWeight: 'normal' }}>
            {' '}
            ({covered} of {feedback.expectedPoints.length} expected points: a free answer only
            counts when every expected point is covered without a major error)
          </span>
        )}
      </p>
      <p style={{ marginBottom: 4 }}>Your answer:</p>
      <blockquote
        lang="fr"
        style={{ margin: '0 0 8px', padding: '4px 12px', borderLeft: '3px solid #ccc' }}
      >
        {feedback.answer}
      </blockquote>
      <p style={{ marginBottom: 4 }}>Expected points:</p>
      <ExpectedPoints points={feedback.expectedPoints} />
      {feedback.misconceptions.length > 0 && (
        <div style={boxStyle}>
          <strong>Misconceptions:</strong>
          <ul lang="fr" style={{ margin: 0 }}>
            {feedback.misconceptions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div lang="fr" style={boxStyle}>
        <strong lang="en">Explanation: </strong>
        {feedback.explanation}
      </div>
      {feedback.toReview.length > 0 && (
        <div style={boxStyle}>
          <strong>To review:</strong>
          <ul lang="fr" style={{ margin: 0 }}>
            {feedback.toReview.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div lang="fr" data-testid="model-answer" style={boxStyle}>
        <strong lang="en">Model answer: </strong>
        {feedback.modelAnswer}
      </div>
      {feedback.contest && (
        <details data-testid="contest-history" style={{ fontSize: '0.9em', color: '#333' }}>
          <summary>
            Grade contested (first grade: {resultLabels[feedback.contest.previous.result]})
          </summary>
          <p>
            Your justification: <q lang="fr">{feedback.contest.justification}</q>
          </p>
          <p lang="fr">{feedback.contest.previous.explanation}</p>
          <ExpectedPoints points={feedback.contest.previous.expectedPoints} />
        </details>
      )}
    </div>
  )
}
