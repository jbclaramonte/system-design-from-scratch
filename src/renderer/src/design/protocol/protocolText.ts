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

/** Status chip variant (classes of the shared `.chip`, see docs/Design System.md). */
export type StepChip = 'locked' | 'mastered' | 'progress' | 'attention' | 'error' | 'neutral'

export type StepStateKind = 'locked' | 'reviewed' | 'submitted' | 'failed' | 'todo'

export interface StepState {
  kind: StepStateKind
  /** Chip text: the state never relies on color alone. */
  label: string
  chip: StepChip
  /** The reason or the count shown under the title. */
  detail: string
}

/** State of a step in the step list: locked, reviewed, waiting for feedback, failed or to do. */
export function stepState(step: ProtocolStepView): StepState {
  if (!step.active) {
    return {
      kind: 'locked',
      label: 'Locked',
      chip: 'locked',
      detail: `Unlocks at exercise ${step.unlockedAt}`
    }
  }
  const reviewed = reviewedCount(step)
  if (reviewed > 0) {
    return {
      kind: 'reviewed',
      label: 'Reviewed',
      chip: 'mastered',
      detail: `${reviewed} ${reviewed === 1 ? 'submission' : 'submissions'} reviewed`
    }
  }
  if (step.submissions.some((submission) => submission.status === 'pending')) {
    return {
      kind: 'submitted',
      label: 'Submitted',
      chip: 'attention',
      detail: 'Waiting for feedback'
    }
  }
  if (step.submissions.length > 0) {
    return { kind: 'failed', label: 'Feedback failed', chip: 'error', detail: 'Submit again' }
  }
  return { kind: 'todo', label: 'To do', chip: 'neutral', detail: 'Not submitted yet' }
}

/** Active steps with a reviewed submission over the active steps (the header progress). */
export function reviewProgress(view: { steps: ProtocolStepView[] }): {
  reviewed: number
  total: number
  percent: number
} {
  const active = view.steps.filter((step) => step.active)
  const reviewed = active.filter((step) => reviewedCount(step) > 0).length
  return {
    reviewed,
    total: active.length,
    percent: active.length === 0 ? 0 : Math.round((reviewed / active.length) * 100)
  }
}

/** State of the final review entry of the step list. */
export function finalReviewState(view: {
  canRequestFinalReview: boolean
  finalReview: unknown
}): StepState {
  if (view.finalReview) {
    return { kind: 'reviewed', label: 'Done', chip: 'mastered', detail: 'Compared with the primer' }
  }
  if (view.canRequestFinalReview) {
    return { kind: 'todo', label: 'Ready', chip: 'neutral', detail: 'Every active step reviewed' }
  }
  return {
    kind: 'locked',
    label: 'Locked',
    chip: 'locked',
    detail: 'After every active step is reviewed'
  }
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

/** "3 of 5 steps reviewed". */
export function progressLabel(progress: { reviewed: number; total: number }): string {
  return `${progress.reviewed} of ${progress.total} ${progress.total === 1 ? 'step' : 'steps'} reviewed`
}

/** Verdict to chip variant of the checklist and of the feedback lists. */
export const verdictChips: Record<ChecklistVerdict, StepChip> = {
  met: 'mastered',
  partial: 'attention',
  missing: 'error'
}

/** Share of met checklist items, 0 to 100. */
export function checklistPercent(checklist: { verdict: ChecklistVerdict }[]): number {
  if (checklist.length === 0) return 0
  const met = checklist.filter((item) => item.verdict === 'met').length
  return Math.round((met / checklist.length) * 100)
}

/** Class names of a status chip. The dot glows for states; locked and neutral chips have none. */
export function chipClass(chip: StepChip): string {
  if (chip === 'neutral') return 'chip'
  if (chip === 'locked') return 'chip chip-locked'
  return `chip chip-${chip} chip-dot`
}
