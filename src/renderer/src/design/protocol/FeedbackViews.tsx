import {
  PROTOCOL_STEP_DEFINITIONS,
  type FinalReviewView,
  type ProtocolStep,
  type StepFeedback,
  type SubmissionView
} from '../../../../shared/protocol'
import { GenerationErrorView } from '../../generation/GenerationErrorView'
import type { ProtocolCallError } from './useProtocolCall'
import {
  checklistPercent,
  checklistScore,
  chipClass,
  verdictChips,
  verdictLabels,
  type StepChip
} from './protocolText'

/**
 * A list of French sentences as a card with a severity chip (Gaps, Errors, Strengths...). The
 * chip carries the label, so the severity never relies on color alone.
 */
function List({
  title,
  items,
  testId,
  tone
}: {
  title: string
  items: string[]
  testId: string
  tone: StepChip
}) {
  if (items.length === 0) return null
  return (
    <div className="protocol-list" data-testid={testId} data-tone={tone}>
      <p className="protocol-list-head">
        <span className={chipClass(tone)}>{title}</span>
        <span className="label-mono faint">{items.length}</span>
      </p>
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
  const percent = checklistPercent(feedback.checklist)
  return (
    <div className="protocol-feedback" data-testid="step-feedback">
      <div className="protocol-feedback-summary">
        <p className="protocol-score label-mono">{checklistScore(feedback.checklist)}</p>
        <div
          className={percent === 100 ? 'progress progress-complete' : 'progress'}
          role="presentation"
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p>{feedback.summary}</p>
      </div>
      <ul className="protocol-checklist">
        {feedback.checklist.map((entry, index) => (
          <li key={index} className={`protocol-verdict-${entry.verdict}`}>
            <span className={`${chipClass(verdictChips[entry.verdict])} protocol-verdict`}>
              {verdictLabels[entry.verdict]}
            </span>
            <div>
              <p className="protocol-checklist-item">{checklist[index]?.item}</p>
              <p className="protocol-checklist-comment">{entry.comment}</p>
            </div>
          </li>
        ))}
      </ul>
      <List title="Gaps" items={feedback.gaps} testId="feedback-gaps" tone="attention" />
      <List title="Errors" items={feedback.errors} testId="feedback-errors" tone="error" />
      <List
        title="Forgotten trade-offs"
        items={feedback.forgottenTradeOffs}
        testId="feedback-tradeoffs"
        tone="attention"
      />
      <p className="note-card note-card-compact note-card-progress">
        <span className="label-caps">Next</span>
        {feedback.nextStep}
      </p>
    </div>
  )
}

const submissionStatus: Record<SubmissionView['status'], { label: string; chip: StepChip }> = {
  reviewed: { label: 'Reviewed', chip: 'mastered' },
  failed: { label: 'Feedback failed', chip: 'error' },
  pending: { label: 'Waiting for feedback', chip: 'attention' }
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
    <section className="protocol-section" data-testid="submission-history">
      <h3 className="label-caps">Feedback history</h3>
      {[...submissions].reverse().map((submission, index) => {
        const status = submissionStatus[submission.status]
        return (
          <details
            key={submission.id}
            open={index === 0}
            className="protocol-submission card-disclosure"
            data-testid="submission"
            data-status={submission.status}
          >
            <summary>
              <span>Submission {submission.number}</span>
              <span className="label-mono faint">
                {new Date(submission.submittedAt).toLocaleString()}
              </span>
              <span className={chipClass(status.chip)}>{status.label}</span>
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
        )
      })}
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
      <h3 className="label-caps">Latest review</h3>
      <p className="protocol-review-summary">{summary}</p>
      <List title="Strengths" items={strengths} testId="review-strengths" tone="mastered" />
      <List
        title="Gaps compared with the Reference Solution"
        items={gapsVsReference}
        testId="review-gaps"
        tone="attention"
      />
      <List
        title="Trade-offs to discuss"
        items={tradeOffsToDiscuss}
        testId="review-tradeoffs"
        tone="attention"
      />
      <List title="Next time" items={nextTime} testId="review-next" tone="progress" />
      {referenceSolution && (
        <p className="protocol-reference">
          <span className="label-caps">Reference Solution</span>
          <button
            type="button"
            className="protocol-link"
            data-testid="reference-solution-link"
            onClick={() => window.open(referenceSolution.url, '_blank', 'noopener,noreferrer')}
          >
            {referenceSolution.title}
          </button>
          <span className="muted">(System Design Primer, CC BY 4.0, opens in your browser)</span>
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
      <p className="status-strip" role="status" data-testid="protocol-pending">
        <span className="spinner" aria-hidden />
        <span className="status-strip-text">{pendingLabel}</span>
        <button type="button" className="btn-sm" data-testid="protocol-cancel" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  }
  if (!error) return null
  if (error.code === 'cancelled') {
    return (
      <p className="notice" role="status" data-testid="protocol-error" data-code={error.code}>
        Cancelled. Your work is kept.
      </p>
    )
  }
  return (
    <GenerationErrorView
      code={error.code}
      message={error.message}
      hint={error.code !== 'refused' ? 'Your work is kept: try again.' : undefined}
      testId="protocol-error"
    />
  )
}
