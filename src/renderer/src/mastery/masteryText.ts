import type { GenerationErrorCode } from '../../../shared/generation'
import type {
  MasteryEvent,
  MasteryState,
  RemediationAngle,
  RemediationTarget,
  TopicMastery
} from '../../../shared/mastery'

export const masteryLabels: Record<TopicMastery, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  mastered: 'Mastered',
  limit_reached: 'Round Limit reached',
  skipped: 'Skipped, come back later'
}

export const angleLabels: Record<RemediationAngle, string> = {
  concrete_example: 'Concrete example',
  analogy: 'Analogy',
  contrast: 'Side-by-side contrast',
  guided_questions: 'Guided questions'
}

/** Progress line of the topic screen: round number, rounds left before the Round Limit. */
export function roundProgress({
  roundNumber,
  failedRounds,
  roundLimit,
  masteryThreshold,
  status
}: MasteryState): string {
  const threshold = `Mastery Threshold ${masteryThreshold}%`
  if (status === 'mastered') return `Mastered · ${threshold}`
  if (failedRounds < roundLimit) {
    return `Round ${roundNumber} · attempt ${failedRounds + 1} of ${roundLimit} before the Round Limit · ${threshold}`
  }
  const failed = `${failedRounds} rounds without success`
  return status === 'in_progress'
    ? `Round ${roundNumber} · another angle after the Round Limit (${failed}) · ${threshold}`
    : `Round ${roundNumber} · Round Limit reached (${failed}) · ${threshold}`
}

/** Status of a round being prepared (the quiz Generation runs in the main process). */
export type RoundPreparation =
  | { status: 'starting' | 'queued' | 'generating' }
  | { status: 'error' | 'cancelled'; code: GenerationErrorCode; message: string }

/** Next preparation status for an event of a round request (`round_ready` is handled apart). */
export function roundPreparation(current: RoundPreparation, event: MasteryEvent): RoundPreparation {
  switch (event.type) {
    case 'queued':
      return { status: 'queued' }
    case 'started':
    case 'retry':
      return { status: 'generating' }
    case 'error':
      return {
        status: event.error.code === 'cancelled' ? 'cancelled' : 'error',
        code: event.error.code,
        message: event.error.message
      }
    default:
      return current
  }
}

/**
 * The Remediation Lesson to open first: the first one not read yet, else the first one. Null when
 * a failed round left no missed notion (for example only free answers that could not be graded):
 * there is nothing to read, the learner can only retry the round.
 */
export function firstRemediationIndex(targets: readonly RemediationTarget[]): number | null {
  if (targets.length === 0) return null
  return Math.max(
    0,
    targets.findIndex((target) => !target.ready)
  )
}

export const preparationText: Record<'starting' | 'queued' | 'generating', string> = {
  starting: 'Preparing the quiz...',
  queued: 'Waiting for a free generation slot...',
  generating: 'Writing fresh questions...'
}
