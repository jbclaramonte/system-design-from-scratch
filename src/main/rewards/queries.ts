// The history the rewards are computed from, read from the tables that already hold it: topics,
// completed rounds, reviewed Protocol Step submissions and the final reviews of Design Exercises.
// A Declared Mastery, a Forced Unlock and everything about Lessons are not read.
import type { Database } from '../db'
import type { RewardHistory } from './rewards'

export function loadRewardHistory(db: Database): RewardHistory {
  return {
    topics: db
      .prepare('SELECT id, in_foundations_module AS inFoundations FROM topics ORDER BY position')
      .all<{ id: number; inFoundations: number }>()
      .map((row) => ({ id: row.id, inFoundations: row.inFoundations === 1 })),
    rounds: db
      .prepare(
        `SELECT id, topic_id AS topicId, completed_at AS completedAt,
                score_percent AS scorePercent, passed
         FROM rounds WHERE completed_at IS NOT NULL ORDER BY id`
      )
      .all<{
        id: number
        topicId: number
        completedAt: string
        scorePercent: number | null
        passed: number | null
      }>()
      .map((row) => ({ ...row, passed: row.passed === null ? null : row.passed === 1 })),
    protocolStepReviews: db
      .prepare(
        `SELECT design_exercise_id AS designExerciseId, protocol_step AS protocolStep,
                updated_at AS reviewedAt
         FROM protocol_step_submissions WHERE status = 'reviewed' ORDER BY id`
      )
      .all<{ designExerciseId: number; protocolStep: string; reviewedAt: string }>(),
    designExerciseCompletions: db
      .prepare(
        `SELECT design_exercise_id AS designExerciseId, MIN(created_at) AS completedAt
         FROM design_feedback WHERE kind = 'final_review' GROUP BY design_exercise_id`
      )
      .all<{ designExerciseId: number; completedAt: string }>()
  }
}
