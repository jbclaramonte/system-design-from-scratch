// Activity Streak and Daily Goal over IPC: the summary computed from the database on every call
// (completed Rounds, reviewed Protocol Steps, the `dailyGoalRounds` setting). The renderer
// reloads it on `path:changed`, pushed after a completed round.
import { z } from 'zod'
import type { Database } from '../db'
import { listRoundCompletionTimes } from '../db/repositories/assessment'
import { listReviewedSubmissionTimes } from '../db/repositories/designPractice'
import { getSettings } from '../db/repositories/settings'
import type { ActivitySummary } from '../../shared/activity'
import { buildActivitySummary, systemDayOf, type DayOf } from './activity'

// The request has no field: the clock and the time zone are the main process's, never the
// renderer's.
export const activityRequest = z.object({}).strict().optional()

export interface ActivityIpc {
  get(request?: unknown): ActivitySummary
}

export interface ActivityIpcOptions {
  /** Injected in tests. */
  now?: () => number
  dayOf?: DayOf
}

export function createActivityIpc(db: Database, options: ActivityIpcOptions = {}): ActivityIpc {
  const now = options.now ?? Date.now
  const dayOf = options.dayOf ?? systemDayOf
  return {
    get(request) {
      activityRequest.parse(request)
      return buildActivitySummary({
        roundCompletions: listRoundCompletionTimes(db),
        protocolStepReviews: listReviewedSubmissionTimes(db),
        dailyGoalRounds: getSettings(db).dailyGoalRounds,
        now: now(),
        dayOf
      })
    }
  }
}
