// XP, Level and Badges over IPC: computed from the history on every call. Reading the summary
// also remembers the Badges earned so far in `celebrated_badges` (insert only, so a Badge keeps
// the time it first unlocked and its celebration, #66, plays once). The renderer reloads on
// `path:changed`, pushed after a completed round.
import { z } from 'zod'
import { systemDayOf, type DayOf } from '../activity/activity'
import type { Database } from '../db'
import { recordBadgeUnlocks } from '../db/repositories/badges'
import type { RewardsSummary, RoundXp, RoundXpRequest } from '../../shared/rewards'
import { loadRewardHistory } from './queries'
import { buildRewardsSummary, roundXpAwards } from './rewards'

// The renderer is not trusted: validate before use. The summary takes no field (the clock and
// the time zone are the main process's).
export const rewardsRequest = z.object({}).strict().optional()
export const roundXpRequest = z.object({ roundId: z.number().int().positive() }).strict()

export interface RewardsIpc {
  get(request?: unknown): RewardsSummary
  getRound(request: RoundXpRequest): RoundXp
}

export interface RewardsIpcOptions {
  /** Injected in tests. */
  now?: () => number
  dayOf?: DayOf
}

export function createRewardsIpc(db: Database, options: RewardsIpcOptions = {}): RewardsIpc {
  const now = options.now ?? Date.now
  const dayOf = options.dayOf ?? systemDayOf
  return {
    get(request) {
      rewardsRequest.parse(request)
      const summary = buildRewardsSummary({ history: loadRewardHistory(db), dayOf, now: now() })
      recordBadgeUnlocks(
        db,
        summary.badges.flatMap((badge) =>
          badge.unlockedAt ? [{ badgeId: badge.id, unlockedAt: badge.unlockedAt }] : []
        )
      )
      return summary
    },

    getRound(request) {
      const { roundId } = roundXpRequest.parse(request)
      const history = loadRewardHistory(db)
      if (!history.rounds.some((round) => round.id === roundId)) {
        throw new Error(`Round ${roundId} is not completed.`)
      }
      return roundXpAwards(history, roundId)
    }
  }
}
