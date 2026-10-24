/**
 * XP, Levels and Badges: pure functions over the learner's history. Nothing is stored (only the
 * Badges already celebrated, see `celebratedBadges`), so history from before the feature counts at
 * once. The clock and the time zone are injected like in src/main/activity/activity.ts.
 *
 * XP (rates in `XP_RULES`, src/shared/rewards.ts):
 * - Completed Round: `round(score / 5)` XP, plus 10 when it passed (stored `passed`). Open
 *   Rounds pay nothing.
 * - First mastery of a Topic: the first passed Round of the Topic pays 50 once, even if a later
 *   Round passes too; a Topic declared as known pays nothing until a Round passes.
 * - Protocol Step: the first reviewed submission of each step of each Design Exercise pays 15
 *   once; submitting the step again pays nothing.
 * - Design Exercise completed (final review recorded): 100 once per exercise.
 * Not inputs, so they pay nothing: a Declared Mastery, a Forced Unlock, reading a Lesson, a Lesson
 * Question, a Question Clarification, re-reading. Every event has a key (`round:12`,
 * `topic:3`, `step:2:api`, `exercise:2`) and the same key never pays twice.
 *
 * Level: a function of total XP, the highest Level whose threshold is reached (`LEVELS`).
 *
 * Badges: each unlocks at the time of the event that completed its rule (`BADGES`), and stays.
 */
import {
  BADGES,
  LEVELS,
  XP_RULES,
  xpReasons,
  type BadgeCriterion,
  type BadgeDefinition,
  type BadgeStatus,
  type LevelProgress,
  type RewardsSummary,
  type RoundXp,
  type XpEventKind
} from '../../shared/rewards'
import { activityDays, dateOf, streakReachedOn, type DayOf } from '../activity/activity'

export interface RewardRound {
  id: number
  topicId: number
  /** Null while the Round is open: it pays nothing. */
  completedAt: string | null
  scorePercent: number | null
  passed: boolean | null
}

export interface RewardHistory {
  /** Topics, with whether they belong to the Foundations Module. */
  topics: readonly { id: number; inFoundations: boolean }[]
  rounds: readonly RewardRound[]
  /** Every reviewed Protocol Step submission, with its step and the time it was reviewed. */
  protocolStepReviews: readonly {
    designExerciseId: number
    protocolStep: string
    reviewedAt: string
  }[]
  /** The final review of each Design Exercise (the earliest one counts). */
  designExerciseCompletions: readonly { designExerciseId: number; completedAt: string }[]
}

export interface XpEvent {
  /** Unique per paid event: the same key never pays twice. */
  key: string
  kind: XpEventKind
  xp: number
  /** ISO 8601 time of the event. */
  at: string
  /** The Round that paid it, for the Round and Topic events. */
  roundId: number | null
  reason: string
}

const time = (iso: string) => Date.parse(iso)

const event = (
  key: string,
  kind: XpEventKind,
  xp: number,
  at: string,
  roundId: number | null = null
): XpEvent => ({ key, kind, xp, at, roundId, reason: xpReasons[kind] })

/** The completed Rounds with a readable date, in the order they happened. */
function completedRounds(rounds: readonly RewardRound[]) {
  return rounds
    .filter((round) => round.completedAt !== null && Number.isFinite(time(round.completedAt)))
    .map((round) => ({ ...round, completedAt: round.completedAt! }))
    .sort((a, b) => time(a.completedAt) - time(b.completedAt) || a.id - b.id)
}

/** The XP of a Round: its score, plus the bonus when it passed. */
export function roundXp(scorePercent: number, passed: boolean): number {
  const score = Math.max(0, Math.min(100, scorePercent))
  return Math.round(score / XP_RULES.roundScoreDivisor) + (passed ? XP_RULES.roundPassedBonus : 0)
}

/**
 * Every XP event of a history, oldest first, each key once. Adding history never changes an
 * event already in the list (a Topic's first mastery stays on the Round that earned it).
 */
export function xpEvents(history: RewardHistory): XpEvent[] {
  const events = new Map<string, XpEvent>()
  const add = (next: XpEvent) => {
    if (!events.has(next.key)) events.set(next.key, next)
  }

  const masteredTopics = new Set<number>()
  for (const round of completedRounds(history.rounds)) {
    if (round.scorePercent === null) continue
    const passed = round.passed === true
    add(
      event(
        `round:${round.id}`,
        passed ? 'round_passed' : 'round_completed',
        roundXp(round.scorePercent, passed),
        round.completedAt,
        round.id
      )
    )
    if (passed && !masteredTopics.has(round.topicId)) {
      masteredTopics.add(round.topicId)
      add(
        event(
          `topic:${round.topicId}`,
          'topic_mastered',
          XP_RULES.topicMastered,
          round.completedAt,
          round.id
        )
      )
    }
  }

  const reviews = [...history.protocolStepReviews]
    .filter((review) => Number.isFinite(time(review.reviewedAt)))
    .sort((a, b) => time(a.reviewedAt) - time(b.reviewedAt))
  for (const review of reviews) {
    add(
      event(
        `step:${review.designExerciseId}:${review.protocolStep}`,
        'protocol_step_passed',
        XP_RULES.protocolStepPassed,
        review.reviewedAt
      )
    )
  }

  const completions = [...history.designExerciseCompletions]
    .filter((completion) => Number.isFinite(time(completion.completedAt)))
    .sort((a, b) => time(a.completedAt) - time(b.completedAt))
  for (const completion of completions) {
    add(
      event(
        `exercise:${completion.designExerciseId}`,
        'design_exercise_completed',
        XP_RULES.designExerciseCompleted,
        completion.completedAt
      )
    )
  }

  return [...events.values()].sort((a, b) => time(a.at) - time(b.at) || (a.key < b.key ? -1 : 1))
}

/** Total XP of events. */
export const totalXp = (events: readonly XpEvent[]): number =>
  events.reduce((sum, next) => sum + next.xp, 0)

/**
 * The incremental way: a ledger that pays an event once and remembers its key. Feeding it the
 * events one by one, as they happen, gives the total `xpEvents` computes from the whole history.
 */
export interface XpLedger {
  paid: ReadonlySet<string>
  xp: number
}

export const emptyLedger = (): XpLedger => ({ paid: new Set(), xp: 0 })

export function payEvent(ledger: XpLedger, next: XpEvent): XpLedger {
  if (ledger.paid.has(next.key)) return ledger
  return { paid: new Set([...ledger.paid, next.key]), xp: ledger.xp + next.xp }
}

/** The Level for a total of XP, with the progress to the next one. */
export function levelProgress(xp: number): LevelProgress {
  const total = Math.max(0, Math.floor(xp))
  let index = 0
  LEVELS.forEach((level, i) => {
    if (total >= level.minXp) index = i
  })
  const current = LEVELS[index]!
  const next = LEVELS[index + 1] ?? null
  const xpIntoLevel = total - current.minXp
  const xpForLevel = next ? next.minXp - current.minXp : null
  return {
    level: current.level,
    name: current.name,
    xp: total,
    xpIntoLevel,
    xpForLevel,
    xpToNext: next ? next.minXp - total : null,
    nextName: next?.name ?? null,
    percent: xpForLevel === null ? 100 : Math.floor((xpIntoLevel / xpForLevel) * 100)
  }
}

export interface BadgeUnlockInput {
  history: RewardHistory
  dayOf: DayOf
  /** Current time, ms since the epoch. */
  now: number
  /** The Badge list; `BADGES` unless a test brings its own. */
  badges?: readonly BadgeDefinition[]
}

/** The latest event time of each Activity Day, to date the Badge unlocked on that day. */
function latestOfDay(history: RewardHistory, dayOf: DayOf): Map<number, string> {
  const latest = new Map<number, string>()
  const stamps = [
    ...history.rounds.flatMap((round) => (round.completedAt ? [round.completedAt] : [])),
    ...history.protocolStepReviews.map((review) => review.reviewedAt)
  ]
  for (const iso of stamps) {
    const ms = time(iso)
    if (!Number.isFinite(ms)) continue
    const day = dayOf(ms)
    const known = latest.get(day)
    if (known === undefined || time(known) < ms) latest.set(day, iso)
  }
  return latest
}

/** When each Badge unlocked (ISO), by id; a Badge that is not earned is absent. */
export function badgeUnlocks(input: BadgeUnlockInput): Map<string, string> {
  const { history, dayOf, now, badges = BADGES } = input
  const rounds = completedRounds(history.rounds)

  // First pass of each Topic, in time order.
  const firstPass = new Map<number, string>()
  for (const round of rounds) {
    if (round.passed === true && !firstPass.has(round.topicId)) {
      firstPass.set(round.topicId, round.completedAt)
    }
  }
  const masteryTimes = [...firstPass.values()]

  const unlockedAt = (criterion: BadgeCriterion): string | null => {
    switch (criterion.kind) {
      case 'topics_mastered':
        return masteryTimes[criterion.count - 1] ?? null
      case 'foundations_completed': {
        const foundations = history.topics.filter((topic) => topic.inFoundations)
        if (foundations.length === 0) return null
        const times = foundations.map((topic) => firstPass.get(topic.id))
        if (times.some((at) => at === undefined)) return null
        return times.reduce((latest, at) => (time(at!) > time(latest!) ? at : latest))!
      }
      case 'perfect_round':
        return (
          rounds.find((round) => round.scorePercent !== null && round.scorePercent >= 100)
            ?.completedAt ?? null
        )
      case 'comeback': {
        const failed = new Set<number>()
        for (const round of rounds) {
          if (round.passed === false) failed.add(round.topicId)
          else if (round.passed === true && failed.has(round.topicId)) return round.completedAt
        }
        return null
      }
      case 'activity_streak': {
        const days = activityDays(
          {
            roundCompletions: rounds.map((round) => round.completedAt),
            protocolStepReviews: history.protocolStepReviews.map((review) => review.reviewedAt)
          },
          dayOf
        )
        const day = streakReachedOn(days, criterion.days, dayOf(now))
        return day === null
          ? null
          : (latestOfDay(history, dayOf).get(day) ?? `${dateOf(day)}T00:00:00.000Z`)
      }
      case 'design_exercises_completed': {
        const times = xpEvents({ ...history, rounds: [], protocolStepReviews: [] })
          .filter((next) => next.kind === 'design_exercise_completed')
          .map((next) => next.at)
        return times[criterion.count - 1] ?? null
      }
    }
  }

  const unlocks = new Map<string, string>()
  for (const badge of badges) {
    const at = unlockedAt(badge.criterion)
    if (at !== null) unlocks.set(badge.id, at)
  }
  return unlocks
}

/** XP, Level and every Badge with its unlock time. */
export function buildRewardsSummary(input: BadgeUnlockInput): RewardsSummary {
  const xp = totalXp(xpEvents(input.history))
  const unlocks = badgeUnlocks(input)
  const badges: BadgeStatus[] = (input.badges ?? BADGES).map((badge) => ({
    id: badge.id,
    title: badge.title,
    rule: badge.rule,
    icon: badge.icon,
    earned: unlocks.has(badge.id),
    unlockedAt: unlocks.get(badge.id) ?? null
  }))
  return { xp, level: levelProgress(xp), badges }
}

/** What one Round paid: its own XP and, if it was the Topic's first pass, the Topic's. */
export function roundXpAwards(history: RewardHistory, roundId: number): RoundXp {
  const awards = xpEvents(history)
    .filter((next) => next.roundId === roundId && next.xp > 0)
    .map((next) => ({ xp: next.xp, kind: next.kind, reason: next.reason }))
  return { roundId, total: awards.reduce((sum, award) => sum + award.xp, 0), awards }
}
