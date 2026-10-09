import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathProgress,
  LearningPathSection,
  LearningPathStep,
  LearningPathStepStatus,
  LearningPathTopicRef,
  TopicStep
} from '../../../shared/learningPath'

export const sectionTitles: Record<LearningPathSection, string> = {
  foundations: 'Foundations Module',
  primer: 'Primer topics',
  design_exercises: 'Design Exercises'
}

export const stepStatusLabels: Record<LearningPathStepStatus, string> = {
  locked: 'Locked',
  available: 'Not started',
  in_progress: 'In progress',
  mastered: 'Mastered',
  skipped: 'Skipped',
  limit_reached: 'Round Limit reached',
  completed: 'Completed',
  coming_soon: 'Coming soon'
}

export const stepTitle = (step: LearningPathStep): string =>
  step.kind === 'topic' ? step.topic.title : step.title

/** Label of the "Continue" call to action on the recommended step. */
export function continueLabel(step: LearningPathStep): string {
  const title = stepTitle(step)
  switch (step.status) {
    case 'in_progress':
      return `Continue: ${title}`
    case 'skipped':
      return `Come back to ${title} with another angle`
    case 'limit_reached':
      return `Choose how to go on with ${title}`
    default:
      return `Start: ${title}`
  }
}

/** Why a topic does not unlock what follows, when it is not simply unfinished. */
function blockerNote(ref: LearningPathTopicRef): string {
  switch (ref.status) {
    case 'skipped':
      return ' It was skipped: come back to it with another angle.'
    case 'limit_reached':
      return ' It reached the Round Limit: try another angle.'
    default:
      return ''
  }
}

const listTitles = (refs: readonly LearningPathTopicRef[]): string => {
  const titles = refs.map((ref) => ref.title)
  return titles.length <= 1
    ? (titles[0] ?? '')
    : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}`
}

/**
 * Why a locked step is locked ("Master X first", "Complete exercise Y first"), or null when it
 * is not locked. A Design Exercise coming soon still lists its missing prerequisites.
 */
export function lockMessage(step: TopicStep | DesignExerciseStep): string | null {
  if (step.kind === 'topic') {
    if (step.status !== 'locked' || !step.lockedBy) return null
    return `Master ${step.lockedBy.title} first.${blockerNote(step.lockedBy)}`
  }
  if (step.status !== 'locked' && step.status !== 'coming_soon') return null
  const reasons = [
    step.missingPrerequisites.length > 0 &&
      `Master ${listTitles(step.missingPrerequisites)} first.`,
    step.status === 'locked' &&
      step.lockedByExercise &&
      `Complete ${step.lockedByExercise.title} first.`
  ].filter((reason): reason is string => Boolean(reason))
  return reasons.length > 0 ? reasons.join(' ') : null
}

/** A Design Exercise the learner can open from the path (to play it, or to read its review). */
export const canOpenExercise = (step: DesignExerciseStep): boolean =>
  step.designExerciseId !== null &&
  (step.status === 'available' || step.status === 'in_progress' || step.status === 'completed')

export function progressText({ masteredTopics, totalTopics, percent }: LearningPathProgress) {
  return `${masteredTopics} of ${totalTopics} topics mastered (${percent}%)`
}

/** The recommended step, or null. */
export const recommendedStep = (path: LearningPath): LearningPathStep | null =>
  path.steps.find((step) => step.key === path.nextStepKey) ?? null

/** The topic step of a slug, to open the topic a lock message names. */
export const topicStepBySlug = (path: LearningPath, slug: string): TopicStep | undefined =>
  path.steps.find((step): step is TopicStep => step.kind === 'topic' && step.topic.slug === slug)

/** What to show when there is no recommended step. */
export function noNextStepText(path: LearningPath): string {
  if (path.progress.totalTopics === 0) return 'No topics yet.'
  if (path.progress.masteredTopics === path.progress.totalTopics) {
    return 'Every topic is mastered and every available Design Exercise completed. More Design Exercises are coming soon.'
  }
  return 'Nothing to start right now.'
}
