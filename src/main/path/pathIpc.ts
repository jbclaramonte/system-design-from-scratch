// Learning Path over IPC: the path computed from the database, the Forced Unlock of a locked step
// and its undo, and the `path:changed` event pushed after a change that can unlock a step (a
// completed round, a Round Limit choice, a Forced Unlock). Design Exercise progress comes from
// their submissions and final reviews.
import { z } from 'zod'
import { NON_TEACHABLE_CORPUS_TOPIC_IDS } from '../content/topics'
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { listRoundsByTopic } from '../db/repositories/assessment'
import {
  listDesignExercises,
  listDesignFeedback,
  listProtocolStepSubmissions
} from '../db/repositories/designPractice'
import {
  addForcedUnlock,
  listForcedUnlocks,
  removeForcedUnlock
} from '../db/repositories/forcedUnlocks'
import { sendEvent, type IpcEventTarget } from '../ipc/sendEvent'
import { listTopicMasteries } from '../mastery/queries'
import { previousDesignExercise } from '../protocol/designExercises'
import type { LearningPath, LearningPathStepRequest } from '../../shared/learningPath'
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
  return buildLearningPath({
    topics,
    primerTopicSlugs,
    exercises,
    forcedUnlocks: listForcedUnlocks(db)
  })
}

// The renderer is not trusted to send well-formed requests: validate before use.
const stepRequest = z.object({
  stepKey: z.string().regex(/^(topic|design_exercise):[A-Za-z0-9_-]{1,100}$/)
})

export interface LearningPathIpc {
  get(): LearningPath
  /**
   * Opens a locked step without mastering what comes before (Forced Unlock): that one step only,
   * no mastery credit. A step that is not locked is left as it is. Returns the recomputed path.
   */
  forceUnlock(request: LearningPathStepRequest): LearningPath
  /**
   * Removes the Forced Unlock of a step that has no progress. Refused once the step has progress
   * (a started step is never locked again). Returns the recomputed path.
   */
  lockAgain(request: LearningPathStepRequest): LearningPath
  /** Pushes the recomputed path on `path:changed`. */
  notifyChanged(target: IpcEventTarget): void
}

export function createLearningPathIpc(deps: LearningPathDeps): LearningPathIpc {
  const { db } = deps

  function requireStep(stepKey: string) {
    const step = getLearningPath(deps).steps.find((candidate) => candidate.key === stepKey)
    if (!step) throw new Error(`There is no step ${stepKey} on the Learning Path.`)
    return step
  }

  return {
    get: () => getLearningPath(deps),

    forceUnlock(request) {
      const { stepKey } = stepRequest.parse(request)
      const step = requireStep(stepKey)
      if (step.kind === 'design_exercise' && step.status === 'coming_soon') {
        throw new Error(`${step.title} is not available yet.`)
      }
      if (step.status === 'locked') addForcedUnlock(db, stepKey)
      return getLearningPath(deps)
    },

    lockAgain(request) {
      const { stepKey } = stepRequest.parse(request)
      const step = requireStep(stepKey)
      if (!listForcedUnlocks(db).includes(stepKey)) return getLearningPath(deps)
      // `available` is a step with no progress: a started step is never locked again.
      if (step.status !== 'available') {
        const title = step.kind === 'topic' ? step.topic.title : step.title
        throw new Error(`${title} already has progress: it cannot be locked again.`)
      }
      removeForcedUnlock(db, stepKey)
      return getLearningPath(deps)
    },

    notifyChanged: (target) => sendEvent(target, 'path:changed', getLearningPath(deps))
  }
}
