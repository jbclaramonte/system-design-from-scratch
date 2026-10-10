import {
  learningPathSections,
  type DesignExerciseStep,
  type LearningPath,
  type LearningPathProgress,
  type LearningPathSection,
  type LearningPathStep,
  type LearningPathStepStatus,
  type LearningPathTopicRef,
  type TopicStep
} from '../../../shared/learningPath'

export const sectionTitles: Record<LearningPathSection, string> = {
  foundations: 'Foundations Module',
  primer: 'Primer topics',
  design_exercises: 'Design Exercises'
}

/** The filter tabs of the screen: every section, or one of them. */
export const pathFilters = ['all', 'foundations', 'primer', 'design_exercises'] as const
export type PathFilter = (typeof pathFilters)[number]

export const pathFilterLabels: Record<PathFilter, string> = {
  all: 'All',
  foundations: 'Foundations',
  primer: 'Primer topics',
  design_exercises: 'Design exercises'
}

/** The sections a filter shows, in path order. */
export const filteredSections = (filter: PathFilter): readonly LearningPathSection[] =>
  filter === 'all' ? learningPathSections : [filter]

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

/** Short label of the button of the Current priority card (the full sentence is `continueLabel`). */
export function actionLabel(step: LearningPathStep): string {
  switch (step.status) {
    case 'in_progress':
      return 'Continue'
    case 'skipped':
      return 'Come back'
    case 'limit_reached':
      return 'Choose how to go on'
    default:
      return 'Start'
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

/** Topic counts of the hero card, from the topic steps of the path. */
export interface TopicCounters {
  mastered: number
  inProgress: number
  /** Topics at the Round Limit, waiting for another angle or a skip. */
  retryRequired: number
  locked: number
}

export function topicCounters(path: LearningPath): TopicCounters {
  const counters: TopicCounters = { mastered: 0, inProgress: 0, retryRequired: 0, locked: 0 }
  for (const step of path.steps) {
    if (step.kind !== 'topic') continue
    if (step.status === 'mastered') counters.mastered += 1
    else if (step.status === 'in_progress') counters.inProgress += 1
    else if (step.status === 'limit_reached') counters.retryRequired += 1
    else if (step.status === 'locked') counters.locked += 1
  }
  return counters
}

/** "6/6 mastered" for a topic section, "1/8 completed" for the Design Exercises. */
export function sectionCounter(path: LearningPath, section: LearningPathSection): string {
  const steps = path.steps.filter((step) => step.section === section)
  const done = steps.filter(
    (step) => step.status === (section === 'design_exercises' ? 'completed' : 'mastered')
  ).length
  return `${done}/${steps.length} ${section === 'design_exercises' ? 'completed' : 'mastered'}`
}

/** The label of a step's status chip. A startable Design Exercise is "Ready to start". */
export const statusLabel = (step: LearningPathStep): string =>
  step.kind === 'design_exercise' && step.status === 'available'
    ? 'Ready to start'
    : stepStatusLabels[step.status]

export type ChipVariant = 'mastered' | 'progress' | 'attention' | 'locked' | 'error' | 'neutral'

/** The chip variant of a status (see the Design System: emerald mastered, indigo in progress...). */
export const statusChipVariant: Record<LearningPathStepStatus, ChipVariant> = {
  locked: 'locked',
  available: 'neutral',
  in_progress: 'progress',
  mastered: 'mastered',
  skipped: 'attention',
  limit_reached: 'error',
  completed: 'mastered',
  coming_soon: 'neutral'
}

/** What an unlocked topic that does not simply continue is waiting for, or null. */
export function statusNote(step: LearningPathStep): string | null {
  if (step.kind !== 'topic') return null
  switch (step.status) {
    case 'limit_reached':
      return 'Round Limit reached: open the topic to try another angle or skip it for now.'
    case 'skipped':
      return 'Skipped for now: come back to it with another angle.'
    default:
      return null
  }
}

/** "3 of 4 prerequisites mastered" for a Design Exercise, or null when it has none. */
export function prerequisiteText(step: DesignExerciseStep): string | null {
  const total = step.prerequisites.length
  if (total === 0) return null
  const mastered = total - step.missingPrerequisites.length
  return `${mastered} of ${total} prerequisites mastered`
}

/** The facts under the title of the Current priority card; only what the step really has. */
export function priorityDetails(step: LearningPathStep): string[] {
  if (step.kind === 'design_exercise') return [step.rationale]
  const details = [step.section === 'foundations' ? sectionTitles.foundations : 'Primer topic']
  if (step.topic.notionCount > 0) {
    details.push(`${step.topic.notionCount} ${step.topic.notionCount === 1 ? 'notion' : 'notions'}`)
  }
  return details
}
