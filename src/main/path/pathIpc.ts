// Learning Path over IPC: the path computed from the database, and the `path:changed` event
// pushed after a change that can unlock a step (a completed round, a Round Limit choice). Design
// Exercise progress comes from their submissions and final reviews.
import { NON_TEACHABLE_CORPUS_TOPIC_IDS } from '../content/topics'
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { listRoundsByTopic } from '../db/repositories/assessment'
import {
  listDesignExercises,
  listDesignFeedback,
  listProtocolStepSubmissions
} from '../db/repositories/designPractice'
import { sendEvent, type IpcEventTarget } from '../ipc/sendEvent'
import { listTopicMasteries } from '../mastery/queries'
import { previousDesignExercise } from '../protocol/designExercises'
import type { LearningPath } from '../../shared/learningPath'
import {
  DESIGN_EXERCISE_PREREQUISITES,
  IMPLEMENTED_DESIGN_EXERCISES,
  type DesignExercisePrerequisites
} from './designExercisePrerequisites'
import { buildLearningPath, type DesignExerciseProgress } from './model'

/** `completed` once a final review is recorded, `in_progress` once a step was submitted. */
function exerciseProgress(db: Database, designExerciseId: number): DesignExerciseProgress {
  if (listDesignFeedback(db, designExerciseId).some((row) => row.kind === 'final_review')) {
    return 'completed'
  }
  return listProtocolStepSubmissions(db, designExerciseId).length > 0
    ? 'in_progress'
    : 'not_started'
}

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
  const rows = new Map(listDesignExercises(db).map((row) => [row.slug, row]))
  const exercises = prerequisites.map((exercise) => {
    const slug = exercise.referenceSolutionId
    const row = rows.get(slug)
    return {
      slug,
      title: row?.title ?? corpus.getReferenceSolution(slug)?.title ?? slug,
      prerequisites: exercise.prerequisites,
      previousExercise: previousDesignExercise(slug)?.slug ?? null,
      rationale: exercise.rationale,
      implemented: implementedExercises.includes(slug),
      designExerciseId: row?.id ?? null,
      progress: row ? exerciseProgress(db, row.id) : ('not_started' as const)
    }
  })
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
