import type {
  AttemptResult,
  ChoiceQuestionFeedback,
  ExpectedPointFeedback,
  FreeAnswerQuestionFeedback,
  QuestionFeedback
} from '../../../shared/quiz'
import {
  choiceFeedbackMessage,
  choiceTally,
  freeAnswerFeedbackMessage,
  resultLabels,
  type FeedbackMessage
} from './feedbackText'

const resultColors: Record<AttemptResult, string> = {
  correct: 'var(--color-mastered-text)',
  partially_correct: 'var(--color-attention-text)',
  incorrect: 'var(--color-error-text)'
}

/** Feedback on an answered question: result, then the details of its kind. */
export function QuestionFeedbackView({ feedback }: { feedback: QuestionFeedback }) {
  return feedback.kind === 'free_answer' ? (
    <FreeAnswerFeedbackView feedback={feedback} />
  ) : (
    <ChoiceFeedbackView feedback={feedback} />
  )
}

/** The verdict line: the label, then what happened in plain words. */
function Verdict({ result, message }: { result: AttemptResult; message: FeedbackMessage }) {
  return (
    <p style={{ fontWeight: 'bold', color: resultColors[result] }} data-testid="feedback-verdict">
      {message.label}
      {message.detail && <span style={{ fontWeight: 'normal' }}>: {message.detail}</span>}
    </p>
  )
}

/** A choice question: every choice marked, and the stored explanation. */
function ChoiceFeedbackView({ feedback }: { feedback: ChoiceQuestionFeedback }) {
  return (
    <div data-testid="question-feedback" data-result={feedback.result}>
      <Verdict
        result={feedback.result}
        message={choiceFeedbackMessage(choiceTally(feedback.choices))}
      />
      <ul lang="fr" style={{ paddingLeft: 0, listStyle: 'none' }}>
        {feedback.choices.map((choice, index) => (
          <li
            key={index}
            style={{
              padding: '4px 8px',
              marginBottom: 4,
              borderLeft: `4px solid ${choice.correct ? resultColors.correct : 'transparent'}`,
              background: choice.selected && !choice.correct ? 'var(--color-error-fill)' : undefined
            }}
          >
            <span aria-hidden="true">{choice.correct ? '✓ ' : choice.selected ? '✗ ' : '  '}</span>
            {choice.text}
            <span style={{ fontSize: '0.85em', color: 'var(--color-text-secondary)' }}>
              {choice.correct && ' (correct answer)'}
              {choice.selected && ' (your answer)'}
            </span>
          </li>
        ))}
      </ul>
      <div lang="fr" style={{ background: 'var(--color-surface-elevated)', padding: '8px 12px' }}>
        <strong lang="en">{feedback.type === 'scenario' ? 'Trade-off' : 'Explanation'}: </strong>
        {feedback.explanation}
      </div>
    </div>
  )
}

const boxStyle = {
  background: 'var(--color-surface-elevated)',
  padding: '8px 12px',
  marginBottom: 8
}

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
          <span lang="en" style={{ fontSize: '0.85em', color: 'var(--color-text-secondary)' }}>
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
      <Verdict
        result={feedback.result}
        message={freeAnswerFeedbackMessage(
          feedback.result,
          covered,
          feedback.expectedPoints.length
        )}
      />
      <p style={{ marginBottom: 4 }}>Your answer:</p>
      <blockquote
        lang="fr"
        style={{
          margin: '0 0 8px',
          padding: '4px 12px',
          borderLeft: '3px solid var(--color-border-active)'
        }}
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
        <details
          data-testid="contest-history"
          style={{ fontSize: '0.9em', color: 'var(--color-text-secondary)' }}
        >
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
