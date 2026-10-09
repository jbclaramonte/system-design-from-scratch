import {
  MAX_HINT_LEVEL,
  PROTOCOL_STEP_DEFINITIONS,
  type ChecklistVerdict,
  type HintLevel,
  type ProtocolExerciseView,
  type ProtocolStep,
  type ProtocolStepView
} from '../../../../shared/protocol'

export const verdictLabels: Record<ChecklistVerdict, string> = {
  met: 'Met',
  partial: 'Partial',
  missing: 'Missing'
}

export const hintLevelLabels: Record<HintLevel, string> = {
  1: 'Nudge',
  2: 'Direction',
  3: 'Near-solution'
}

export const stepTitle = (step: ProtocolStep) => PROTOCOL_STEP_DEFINITIONS[step].title

export const reviewedCount = (step: ProtocolStepView) =>
  step.submissions.filter((submission) => submission.status === 'reviewed').length

/** One-line status of a step in the step list. */
export function stepStatus(step: ProtocolStepView): string {
  if (!step.active) return `Locked: unlocks at exercise ${step.unlockedAt}`
  const reviewed = reviewedCount(step)
  if (reviewed > 0) return `Reviewed (${reviewed} ${reviewed === 1 ? 'submission' : 'submissions'})`
  if (step.submissions.length > 0) return 'Feedback failed: submit again'
  return 'Not submitted yet'
}

/** The step to open first: the first active step without a reviewed submission, else the first. */
export function defaultStep(view: ProtocolExerciseView): ProtocolStep {
  const active = view.steps.filter((step) => step.active)
  return (active.find((step) => reviewedCount(step) === 0) ?? active[0] ?? view.steps[0]!).step
}

/** Label of the Hint button. */
export function hintButtonLabel(next: HintLevel | null): string {
  if (next === null) return 'No Hint left'
  return `Hint ${next}/${MAX_HINT_LEVEL} (${hintLevelLabels[next].toLowerCase()})`
}

/** "3/4 checklist items met". */
export function checklistScore(checklist: { verdict: ChecklistVerdict }[]): string {
  const met = checklist.filter((item) => item.verdict === 'met').length
  return `${met}/${checklist.length} checklist items met`
}
