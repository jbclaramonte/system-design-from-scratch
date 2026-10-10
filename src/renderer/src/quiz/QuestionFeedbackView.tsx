import type {
  AttemptResult,
  ChoiceQuestionFeedback,
  ExpectedPointFeedback,
  FreeAnswerQuestionFeedback,
  QuestionFeedback
} from '../../../shared/quiz'
import { choiceMark, type ChoiceState } from './choiceMark'
import {
  choiceFeedbackMessage,
  choiceTally,
  freeAnswerFeedbackMessage,
  resultLabels,
  type FeedbackMessage
} from './feedbackText'
import './quiz.css'

/** Status chip of a verdict: label text always shown, the color only adds to it. */
const resultChips: Record<AttemptResult, string> = {
  correct: 'chip-mastered',
  partially_correct: 'chip-attention',
  incorrect: 'chip-error'
}

/** Tone of the row of a marked choice. */
const stateRows: Record<ChoiceState, string> = {
  correct: ' mark-row-mastered',
  wrong: ' mark-row-error',
  missed: ' mark-row-attention',
  answer: ' mark-row-mastered mark-row-outline',
  neutral: ''
}

/** Status chip of a marked choice. */
const stateChips: Record<ChoiceState, string> = {
  correct: 'chip-mastered',
  wrong: 'chip-error',
  missed: 'chip-attention',
  answer: 'chip-mastered',
  neutral: ''
}

/** Feedback on an answered question: result, then the details of its kind. */
export function QuestionFeedbackView({ feedback }: { feedback: QuestionFeedback }) {
  return feedback.kind === 'free_answer' ? (
    <FreeAnswerFeedbackView feedback={feedback} />
  ) : (
    <ChoiceFeedbackView feedback={feedback} />
  )
}

/** The verdict line: the chip with the label, then what happened in plain words. */
function Verdict({ result, message }: { result: AttemptResult; message: FeedbackMessage }) {
  return (
    <p className="quiz-verdict" data-testid="feedback-verdict">
      <span className={`chip chip-dot ${resultChips[result]}`}>{message.label}</span>
      {message.detail && (
        <span className="quiz-verdict-detail">
          <span className="visually-hidden">: </span>
          {message.detail}
        </span>
      )}
    </p>
  )
}

/** A card with a caps label and its content. */
function Note({
  title,
  lang,
  attention,
  testId,
  children
}: {
  title: string
  /** Language of the content (the title stays English). */
  lang?: string
  attention?: boolean
  testId?: string
  children: React.ReactNode
}) {
  return (
    <section className={`note-card${attention ? ' note-card-attention' : ''}`} data-testid={testId}>
      <h4 className="label-caps">{title}</h4>
      <div lang={lang}>{children}</div>
    </section>
  )
}

/** A choice question: every choice marked, and the stored explanation. */
function ChoiceFeedbackView({ feedback }: { feedback: ChoiceQuestionFeedback }) {
  return (
    <div className="quiz-feedback" data-testid="question-feedback" data-result={feedback.result}>
      <Verdict
        result={feedback.result}
        message={choiceFeedbackMessage(choiceTally(feedback.choices))}
      />
      <ul lang="fr" className="quiz-marks">
        {feedback.choices.map((choice, index) => {
          const mark = choiceMark(choice, feedback.type)
          return (
            <li key={index} className={`mark-row${stateRows[mark.state]}`} data-state={mark.state}>
              <span className="mark-row-glyph" aria-hidden="true">
                {mark.glyph}
              </span>
              <span className="mark-row-text">{choice.text}</span>
              <span className="mark-row-chips" lang="en">
                {choice.selected && <span className="chip">Your answer</span>}
                {mark.label && (
                  <span className={`chip ${stateChips[mark.state]}`}>{mark.label}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <Note title={feedback.type === 'scenario' ? 'Trade-off' : 'Explanation'} lang="fr">
        {feedback.explanation}
      </Note>
    </div>
  )
}

function ExpectedPoints({ points }: { points: ExpectedPointFeedback[] }) {
  return (
    <ul lang="fr" className="quiz-marks">
      {points.map((point, index) => (
        <li
          key={index}
          className={`mark-row ${point.covered ? 'mark-row-mastered' : 'mark-row-attention'}`}
          data-covered={String(point.covered)}
        >
          <span className="mark-row-glyph" aria-hidden="true">
            {point.covered ? '✓' : '!'}
          </span>
          <span className="quiz-point-body">
            <strong>{point.point}</strong>
            <span className="quiz-point-justification">{point.justification}</span>
          </span>
          <span className="mark-row-chips" lang="en">
            <span className={`chip ${point.covered ? 'chip-mastered' : 'chip-attention'}`}>
              {point.covered ? 'Covered' : 'Missing'}
            </span>
          </span>
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
    <div
      className="quiz-feedback"
      data-testid="question-feedback"
      data-result={feedback.result}
      data-kind="free_answer"
    >
      <Verdict
        result={feedback.result}
        message={freeAnswerFeedbackMessage(
          feedback.result,
          covered,
          feedback.expectedPoints.length
        )}
      />
      <div className="quiz-stack">
        <h4 className="label-caps quiz-section-label">Your answer</h4>
        <blockquote lang="fr" className="quiz-answer">
          {feedback.answer}
        </blockquote>
      </div>
      <div className="quiz-stack">
        <h4 className="label-caps quiz-section-label">Expected points</h4>
        <ExpectedPoints points={feedback.expectedPoints} />
      </div>
      {feedback.misconceptions.length > 0 && (
        <Note title="Misconceptions" lang="fr" attention>
          <ul>
            {feedback.misconceptions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Note>
      )}
      <Note title="Explanation" lang="fr">
        {feedback.explanation}
      </Note>
      {feedback.toReview.length > 0 && (
        <Note title="To review" lang="fr">
          <ul>
            {feedback.toReview.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Note>
      )}
      <Note title="Model answer" lang="fr" testId="model-answer">
        {feedback.modelAnswer}
      </Note>
      {feedback.contest && (
        <details className="quiz-contest-history" data-testid="contest-history">
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
