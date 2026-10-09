import {
  PROTOCOL_STEP_DEFINITIONS,
  type FinalReviewView,
  type ProtocolStep,
  type StepFeedback,
  type SubmissionView
} from '../../../../shared/protocol'
import { SettingsErrorAction } from '../../settings/SettingsErrorAction'
import type { ProtocolCallError } from './useProtocolCall'
import { checklistScore, verdictLabels } from './protocolText'

function List({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  if (items.length === 0) return null
  return (
    <div data-testid={testId}>
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/** Design Feedback on one submitted step: checklist verdicts, gaps, errors, trade-offs. */
export function StepFeedbackView({
  step,
  feedback
}: {
  step: ProtocolStep
  feedback: StepFeedback
}) {
  const checklist = PROTOCOL_STEP_DEFINITIONS[step].checklist
  return (
    <div className="protocol-feedback" data-testid="step-feedback">
      <p className="protocol-feedback-summary">
        <strong>{checklistScore(feedback.checklist)}.</strong> {feedback.summary}
      </p>
      <ul className="protocol-checklist">
        {feedback.checklist.map((entry, index) => (
          <li key={index} className={`protocol-verdict-${entry.verdict}`}>
            <span className="protocol-verdict">{verdictLabels[entry.verdict]}</span>{' '}
            <span className="protocol-checklist-item">{checklist[index]?.item}</span>
            <br />
            {entry.comment}
          </li>
        ))}
      </ul>
      <List title="Gaps" items={feedback.gaps} testId="feedback-gaps" />
      <List title="Errors" items={feedback.errors} testId="feedback-errors" />
      <List
        title="Forgotten trade-offs"
        items={feedback.forgottenTradeOffs}
        testId="feedback-tradeoffs"
      />
      <p>
        <strong>Next:</strong> {feedback.nextStep}
      </p>
    </div>
  )
}

/** Submissions of a step, latest first, each with its feedback. */
export function SubmissionHistory({
  step,
  submissions
}: {
  step: ProtocolStep
  submissions: SubmissionView[]
}) {
  if (submissions.length === 0) return null
  return (
    <section data-testid="submission-history">
      <h4>Feedback history</h4>
      {[...submissions].reverse().map((submission, index) => (
        <details
          key={submission.id}
          open={index === 0}
          className="protocol-submission"
          data-testid="submission"
          data-status={submission.status}
        >
          <summary>
            Submission {submission.number} ({new Date(submission.submittedAt).toLocaleString()}):{' '}
            {submission.status === 'reviewed'
              ? 'reviewed'
              : submission.status === 'failed'
                ? 'feedback failed'
                : 'waiting for feedback'}
          </summary>
          {submission.content.type === 'text' ? (
            <pre className="protocol-submitted">{submission.content.text}</pre>
          ) : (
            <pre className="protocol-submitted">
              {submission.content.description}
              {submission.content.notes && `\n\nNotes: ${submission.content.notes}`}
            </pre>
          )}
          {submission.feedback && <StepFeedbackView step={step} feedback={submission.feedback} />}
        </details>
      ))}
    </section>
  )
}

/** Final review against the Reference Solution, with the link to the primer's solution. */
export function FinalReviewPanel({
  review,
  referenceSolution
}: {
  review: FinalReviewView
  referenceSolution: { title: string; url: string } | null
}) {
  const { summary, strengths, gapsVsReference, tradeOffsToDiscuss, nextTime } = review.review
  return (
    <section className="protocol-final-review" data-testid="final-review">
      <h3>Final review</h3>
      <p>{summary}</p>
      <List title="Strengths" items={strengths} testId="review-strengths" />
      <List
        title="Gaps compared with the Reference Solution"
        items={gapsVsReference}
        testId="review-gaps"
      />
      <List title="Trade-offs to discuss" items={tradeOffsToDiscuss} testId="review-tradeoffs" />
      <List title="Next time" items={nextTime} testId="review-next" />
      {referenceSolution && (
        <p>
          Reference Solution:{' '}
          <button
            type="button"
            className="protocol-link"
            data-testid="reference-solution-link"
            onClick={() => window.open(referenceSolution.url, '_blank', 'noopener,noreferrer')}
          >
            {referenceSolution.title}
          </button>{' '}
          (System Design Primer, CC BY 4.0, opens in your browser)
        </p>
      )}
    </section>
  )
}

/** Pending state (with Cancel) or the error of a protocol call. */
export function CallStatus({
  pending,
  error,
  pendingLabel,
  onCancel
}: {
  pending: boolean
  error: ProtocolCallError | null
  pendingLabel: string
  onCancel: () => void
}) {
  if (pending) {
    return (
      <p className="lesson-status" role="status" data-testid="protocol-pending">
        <span className="lesson-spinner" aria-hidden /> {pendingLabel}{' '}
        <button type="button" data-testid="protocol-cancel" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  }
  if (!error) return null
  if (error.code === 'cancelled') {
    return (
      <p
        className="lesson-notice"
        role="status"
        data-testid="protocol-error"
        data-code={error.code}
      >
        Cancelled. Your work is kept.
      </p>
    )
  }
  return (
    <p className="lesson-error" role="alert" data-testid="protocol-error" data-code={error.code}>
      {error.message}
      {error.code !== 'refused' && ' Your work is kept: try again.'}{' '}
      <SettingsErrorAction code={error.code} />
    </p>
  )
}
