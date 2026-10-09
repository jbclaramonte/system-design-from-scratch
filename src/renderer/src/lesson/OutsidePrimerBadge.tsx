import './lesson.css'

/** Flags ungrounded content: a Foundations Module topic, generated outside the primer. */
export function OutsidePrimerBadge({ testId }: { testId?: string }) {
  return (
    <span
      className="lesson-badge lesson-badge-ungrounded"
      data-testid={testId}
      title="Foundations Module: generated from general knowledge, not checked against the primer"
    >
      Outside the primer
    </span>
  )
}
