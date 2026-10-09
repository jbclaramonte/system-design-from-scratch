// Learning Path model. Pure: the path is computed from the topics (with their mastery) and the
// Design Exercise slots, never stored. Rules in docs/Learning Path Implementation.md.
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStep,
  LearningPathStepStatus,
  LearningPathTopicRef,
  TopicStep
} from '../../shared/learningPath'
import type { TopicMastery, TopicMasterySummary } from '../../shared/mastery'

export interface PathTopic extends TopicMasterySummary {
  /**
   * A round of the topic once met the Mastery Threshold. A mastered topic stays mastered, even
   * if a later round (from a dev screen) failed.
   */
  everMastered: boolean
}

export interface DesignExerciseSlot {
  slug: string
  title: string
  /** Topic slugs to master first. */
  prerequisites: readonly string[]
  rationale: string
  implemented: boolean
}

export interface LearningPathInput {
  /** Every topic of the database, in Learning Path order (position). */
  topics: readonly PathTopic[]
  /** Teachable primer topic slugs, in primer order. Topics neither here nor in the Foundations Module are left out. */
  primerTopicSlugs: readonly string[]
  exercises: readonly DesignExerciseSlot[]
}

const ownStatus: Record<Exclude<TopicMastery, 'mastered'>, LearningPathStepStatus> = {
  not_started: 'available',
  in_progress: 'in_progress',
  skipped: 'skipped',
  limit_reached: 'limit_reached'
}

const refOf = (step: TopicStep): LearningPathTopicRef => ({
  slug: step.topic.slug,
  title: step.topic.title,
  status: step.status
})

/**
 * Topic steps in order. A topic is:
 * - `mastered` once a round met the threshold (`everMastered`), whatever came after;
 * - unlocked when it is the first step, the previous topic is mastered, or it already has
 *   progress (a started topic is never locked again, for example when Foundations Module topics
 *   are inserted before it);
 * - otherwise `locked` by the previous topic. A skipped or limit_reached topic does not unlock
 *   the next one.
 */
function topicSteps(input: LearningPathInput): TopicStep[] {
  const bySlug = new Map(input.topics.map((topic) => [topic.slug, topic]))
  const foundations = input.topics.filter((topic) => topic.inFoundationsModule)
  const primer = input.primerTopicSlugs.flatMap((slug) => {
    const topic = bySlug.get(slug)
    return topic && !topic.inFoundationsModule ? [topic] : []
  })
  const ordered = [
    ...foundations.map((topic) => ({ topic, section: 'foundations' as const })),
    ...primer.map((topic) => ({ topic, section: 'primer' as const }))
  ]
  const steps: TopicStep[] = []
  for (const { topic, section } of ordered) {
    const { everMastered, ...summary } = topic
    const previous = steps.at(-1)
    const mastered = everMastered || topic.mastery === 'mastered'
    const unlocked = !previous || previous.status === 'mastered' || topic.mastery !== 'not_started'
    const status: LearningPathStepStatus = mastered
      ? 'mastered'
      : unlocked
        ? ownStatus[topic.mastery as Exclude<TopicMastery, 'mastered'>]
        : 'locked'
    steps.push({
      kind: 'topic',
      key: `topic:${topic.slug}`,
      section,
      topic: summary,
      status,
      lockedBy: status === 'locked' && previous ? refOf(previous) : null
    })
  }
  return steps
}

/**
 * Design Exercise steps: unlocked when every prerequisite topic is mastered (a prerequisite
 * missing from the path never counts as mastered); `coming_soon` while not implemented.
 */
function exerciseSteps(
  input: LearningPathInput,
  topics: readonly TopicStep[]
): DesignExerciseStep[] {
  const bySlug = new Map(topics.map((step) => [step.topic.slug, step]))
  return input.exercises.map((exercise) => {
    const prerequisites = exercise.prerequisites.map((slug): LearningPathTopicRef => {
      const step = bySlug.get(slug)
      return step ? refOf(step) : { slug, title: slug, status: 'locked' }
    })
    const missingPrerequisites = prerequisites.filter((ref) => ref.status !== 'mastered')
    return {
      kind: 'design_exercise',
      key: `design_exercise:${exercise.slug}`,
      section: 'design_exercises',
      slug: exercise.slug,
      title: exercise.title,
      status: !exercise.implemented
        ? 'coming_soon'
        : missingPrerequisites.length > 0
          ? 'locked'
          : 'available',
      prerequisites,
      missingPrerequisites,
      rationale: exercise.rationale
    }
  })
}

/** Statuses of a step the learner can open now. */
const actionable = (status: LearningPathStepStatus): boolean =>
  status !== 'locked' && status !== 'mastered' && status !== 'coming_soon'

/**
 * The recommended step: the first topic not mastered that can be opened (a skipped or
 * limit_reached topic included, so the way forward is always shown), else the first available
 * Design Exercise, else none.
 */
export function nextStep(steps: readonly LearningPathStep[]): LearningPathStep | null {
  return (
    steps.find((step) => step.kind === 'topic' && actionable(step.status)) ??
    steps.find((step) => step.kind === 'design_exercise' && step.status === 'available') ??
    null
  )
}

/** The Learning Path: steps with their status, the recommended step and the progress. */
export function buildLearningPath(input: LearningPathInput): LearningPath {
  const topics = topicSteps(input)
  const exercises = exerciseSteps(input, topics)
  const steps: LearningPathStep[] = [...topics, ...exercises]
  const masteredTopics = topics.filter((step) => step.status === 'mastered').length
  return {
    steps,
    nextStepKey: nextStep(steps)?.key ?? null,
    progress: {
      masteredTopics,
      totalTopics: topics.length,
      percent: topics.length > 0 ? Math.floor((masteredTopics * 100) / topics.length) : 0,
      unlockedExercises: exercises.filter((step) => step.missingPrerequisites.length === 0).length,
      totalExercises: exercises.length
    }
  }
}
