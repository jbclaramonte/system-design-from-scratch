// The Learning Path lock, enforced in the main process: outside dev builds, a locked topic
// cannot start a Round or a Remediation Lesson, and a locked Design Exercise cannot be opened or
// played, whatever the renderer sends.
import { GenerationError } from '../generation/errors'
import type { DesignExerciseStep, TopicStep } from '../../shared/learningPath'
import { getLearningPath, type LearningPathDeps } from './pathIpc'

/** Throws a `topic_locked` error for a locked topic; does nothing for any other topic. */
export type TopicLockGuard = (topicId: number) => void

/** The topic's step when it is `locked`; undefined when unlocked or outside the path. */
export function lockedTopicStep(deps: LearningPathDeps, topicId: number): TopicStep | undefined {
  return getLearningPath(deps).steps.find(
    (step): step is TopicStep =>
      step.kind === 'topic' && step.topic.id === topicId && step.status === 'locked'
  )
}

export function topicLockedError(step: TopicStep): GenerationError {
  const blocker = step.lockedBy ? `Master ${step.lockedBy.title} first` : 'Master the step before'
  return new GenerationError(
    'topic_locked',
    `${step.topic.title} is locked. ${blocker}, then come back from the Learning Path.`
  )
}

/**
 * The guard of the entries that start a Round or a Remediation Lesson. `allowLockedTopics`
 * (dev builds: `!app.isPackaged`, like the dev screens) turns it off. A topic with progress is
 * never locked (see `buildLearningPath`), so a started topic is always allowed.
 */
export function createTopicLockGuard(
  deps: LearningPathDeps,
  { allowLockedTopics }: { allowLockedTopics: boolean }
): TopicLockGuard {
  return (topicId) => {
    if (allowLockedTopics) return
    const step = lockedTopicStep(deps, topicId)
    if (step) throw topicLockedError(step)
  }
}

/** Throws for a Design Exercise that is locked or coming soon; does nothing for any other. */
export type ExerciseLockGuard = (designExerciseId: number) => void

/** The exercise's step when it cannot be played; undefined when playable or outside the path. */
export function lockedExerciseStep(
  deps: LearningPathDeps,
  designExerciseId: number
): DesignExerciseStep | undefined {
  return getLearningPath(deps).steps.find(
    (step): step is DesignExerciseStep =>
      step.kind === 'design_exercise' &&
      step.designExerciseId === designExerciseId &&
      (step.status === 'locked' || step.status === 'coming_soon')
  )
}

export function exerciseLockedError(step: DesignExerciseStep): Error {
  const blockers = [
    ...step.missingPrerequisites.map((ref) => `master ${ref.title}`),
    ...(step.lockedByExercise ? [`complete ${step.lockedByExercise.title}`] : [])
  ]
  const reason =
    step.status === 'coming_soon'
      ? 'is not available yet.'
      : `is locked. First ${blockers.join(', ') || 'unlock it'}, then come back from the Learning Path.`
  return new Error(`${step.title} ${reason}`)
}

/**
 * The guard of every Interview Protocol entry of an exercise. `allowLockedExercises` (dev
 * builds) turns it off. Exercises outside the path (dev fixtures) are never locked, and a
 * started exercise never is (see `buildLearningPath`).
 */
export function createExerciseLockGuard(
  deps: LearningPathDeps,
  { allowLockedExercises }: { allowLockedExercises: boolean }
): ExerciseLockGuard {
  return (designExerciseId) => {
    if (allowLockedExercises) return
    const step = lockedExerciseStep(deps, designExerciseId)
    if (step) throw exerciseLockedError(step)
  }
}
