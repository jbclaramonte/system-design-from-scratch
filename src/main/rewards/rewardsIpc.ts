// XP, Level and Badges over IPC: computed from the history on every call. Every call also
// remembers what is earned so far: the first one takes the baseline (everything earned then is
// already celebrated), later ones record new Badges as uncelebrated, so a Badge keeps the time it
// first unlocked and its celebration (#66) plays once. The renderer reloads on `path:changed`,
// pushed after a completed round.
import { z } from 'zod'
import { systemDayOf, type DayOf } from '../activity/activity'
import type { Database } from '../db'
import {
  getCelebratedLevel,
  listBadgeUnlocks,
  markBadgeCelebrated,
  raiseCelebratedLevel,
  recordBadgeUnlocks,
  takeRewardsBaseline
} from '../db/repositories/badges'
import {
  BADGES,
  type MarkCelebratedRequest,
  type PendingCelebrations,
  type RewardsSummary,
  type RoundXp,
  type RoundXpRequest
} from '../../shared/rewards'
import { loadRewardHistory } from './queries'
import { buildRewardsSummary, roundXpAwards } from './rewards'

// The renderer is not trusted: validate before use. The summary takes no field (the clock and
// the time zone are the main process's).
export const rewardsRequest = z.object({}).strict().optional()
export const roundXpRequest = z.object({ roundId: z.number().int().positive() }).strict()
export const markCelebratedRequest = z
  .object({
    badgeIds: z.array(z.string().min(1)).max(BADGES.length),
    level: z.number().int().positive().nullable()
  })
  .strict()

export interface RewardsIpc {
  get(request?: unknown): RewardsSummary
  getRound(request: RoundXpRequest): RoundXp
  /** The Badges and the Level that unlocked since the last celebration. */
  getCelebrations(request?: unknown): PendingCelebrations
  /** Remembers what was shown, so it is never celebrated again. */
  markCelebrated(request: MarkCelebratedRequest): void
}

export interface RewardsIpcOptions {
  /** Injected in tests. */
  now?: () => number
  dayOf?: DayOf
}

export function createRewardsIpc(db: Database, options: RewardsIpcOptions = {}): RewardsIpc {
  const now = options.now ?? Date.now
  const dayOf = options.dayOf ?? systemDayOf

  /** The summary, with what it earned remembered (the baseline on the very first call). */
  const read = (): RewardsSummary => {
    const summary = buildRewardsSummary({ history: loadRewardHistory(db), dayOf, now: now() })
    const earned = summary.badges.flatMap((badge) =>
      badge.unlockedAt ? [{ badgeId: badge.id, unlockedAt: badge.unlockedAt }] : []
    )
    if (!takeRewardsBaseline(db, { level: summary.level.level, earned })) {
      recordBadgeUnlocks(db, earned)
    }
    return summary
  }

  return {
    get(request) {
      rewardsRequest.parse(request)
      return read()
    },

    getCelebrations(request) {
      rewardsRequest.parse(request)
      const summary = read()
      const waiting = new Set(
        listBadgeUnlocks(db)
          .filter((row) => !row.celebrated)
          .map((row) => row.badgeId)
      )
      // Unlock order: by the time of the unlocking event, the Badge list order on a tie.
      const badges = summary.badges
        .filter((badge) => badge.earned && waiting.has(badge.id))
        .sort((a, b) => (a.unlockedAt ?? '').localeCompare(b.unlockedAt ?? ''))
      const celebrated = getCelebratedLevel(db) ?? summary.level.level
      return {
        badges,
        level:
          summary.level.level > celebrated
            ? {
                level: summary.level.level,
                name: summary.level.name,
                previousLevel: celebrated
              }
            : null
      }
    },

    markCelebrated(request) {
      const { badgeIds, level } = markCelebratedRequest.parse(request)
      // Called after a display, so the baseline exists; take it first if it does not.
      const summary = read()
      db.transaction(() => {
        for (const badgeId of badgeIds) markBadgeCelebrated(db, badgeId)
        // Never beyond the Level actually reached.
        if (level !== null) raiseCelebratedLevel(db, Math.min(level, summary.level.level))
      })
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
