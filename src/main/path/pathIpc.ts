// Learning Path over IPC: the path computed from the database, and the `path:changed` event
// pushed after a change that can unlock a step (a completed round, a Round Limit choice).
import { NON_TEACHABLE_CORPUS_TOPIC_IDS } from '../content/topics'
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { listRoundsByTopic } from '../db/repositories/assessment'
import { sendEvent, type IpcEventTarget } from '../ipc/sendEvent'
import { listTopicMasteries } from '../mastery/queries'
import type { LearningPath } from '../../shared/learningPath'
import {
  DESIGN_EXERCISE_PREREQUISITES,
  IMPLEMENTED_DESIGN_EXERCISES,
  type DesignExercisePrerequisites
} from './designExercisePrerequisites'
import { buildLearningPath } from './model'

export interface LearningPathDeps {
  db: Database
  corpus: Corpus
  prerequisites?: readonly DesignExercisePrerequisites[]
  implementedExercises?: readonly string[]
}

/** The Learning Path from the database state (topics, their mastery and rounds). */
export function getLearningPath({
  db,
  corpus,
  prerequisites = DESIGN_EXERCISE_PREREQUISITES,
  implementedExercises = IMPLEMENTED_DESIGN_EXERCISES
}: LearningPathDeps): LearningPath {
  const topics = listTopicMasteries(db).map((topic) => ({
    ...topic,
    everMastered: listRoundsByTopic(db, topic.id).some((round) => round.passed === true)
  }))
  const primerTopicSlugs = corpus
    .listTopics()
    .map((topic) => topic.id)
    .filter((id) => !NON_TEACHABLE_CORPUS_TOPIC_IDS.includes(id))
  const exercises = prerequisites.map((exercise) => ({
    slug: exercise.referenceSolutionId,
    title:
      corpus.getReferenceSolution(exercise.referenceSolutionId)?.title ??
      exercise.referenceSolutionId,
    prerequisites: exercise.prerequisites,
    rationale: exercise.rationale,
    implemented: implementedExercises.includes(exercise.referenceSolutionId)
  }))
  return buildLearningPath({ topics, primerTopicSlugs, exercises })
}

export interface LearningPathIpc {
  get(): LearningPath
  /** Pushes the recomputed path on `path:changed`. */
  notifyChanged(target: IpcEventTarget): void
}

export function createLearningPathIpc(deps: LearningPathDeps): LearningPathIpc {
  return {
    get: () => getLearningPath(deps),
    notifyChanged: (target) => sendEvent(target, 'path:changed', getLearningPath(deps))
  }
}
