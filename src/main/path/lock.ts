// The Learning Path lock, enforced in the main process: outside dev builds, a locked topic
// cannot start a Round or a Remediation Lesson, whatever the renderer sends.
import { GenerationError } from '../generation/errors'
import type { TopicStep } from '../../shared/learningPath'
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
