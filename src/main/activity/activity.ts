/**
 * Activity Streak and Daily Goal: pure functions over timestamps. Nothing is stored; the history
 * of completed Rounds and reviewed Protocol Steps is the only input, so past activity counts at
 * once. The clock and the time zone are injected (`now`, `DayOf`) so tests are deterministic.
 * Rules, shortly (full text in docs/concepts/Activity Streak.md):
 *
 * - Activity Day: a local calendar day (it changes at local midnight) with at least one
 *   completed Round or one reviewed Protocol Step. Opening a Lesson, a Declared Mastery and a
 *   Forced Unlock are not inputs, so they add nothing.
 * - Activity Streak: Activity Days in a row ending today, or yesterday while today has none yet.
 * - Grace day: ONE missed day between two Activity Days does not break the streak, and the
 *   grace day itself (the missed day) is not counted in the streak. At most one grace day per 7
 *   days: two grace days are at least 7 days apart (`GRACE_INTERVAL_DAYS`). It is decided in
 *   chronological order, so a streak never changes retroactively when new days are added. A grace
 *   day is spent even if the streak later breaks. Two or more missed days in a row break the
 *   streak, and so does a second missed day within 7 days of the previous grace day.
 * - Daily Goal: Rounds completed today against `dailyGoalRounds`; Protocol Steps do not count.
 *
 * Days are integers (the local calendar date as days since 1970-01-01), so day arithmetic is
 * immune to daylight-saving changes (a local day can last 23 or 25 hours).
 */
import type {
  ActivityDate,
  ActivityStreak,
  ActivitySummary,
  ActivityWeekDay,
  DailyGoalProgress
} from '../../shared/activity'

/** The local calendar day of a timestamp (ms since the epoch), as a day number. */
export type DayOf = (timestamp: number) => number

const DAY_MS = 86_400_000

/** A grace day may be used at most once per 7 days: two of them are at least 7 days apart. */
export const GRACE_INTERVAL_DAYS = 7

const dayNumber = (year: number, month: number, day: number) =>
  Math.round(Date.UTC(year, month, day) / DAY_MS)

/** The day of the machine's own time zone (what the app uses). */
export const systemDayOf: DayOf = (timestamp) => {
  const date = new Date(timestamp)
  return dayNumber(date.getFullYear(), date.getMonth(), date.getDate())
}

/** The day in an IANA time zone, for example `Europe/Paris` (tests, and a possible override). */
export function dayOfInZone(timeZone: string): DayOf {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return (timestamp) => {
    const parts = format.formatToParts(new Date(timestamp))
    const part = (type: string) => Number(parts.find((p) => p.type === type)!.value)
    return dayNumber(part('year'), part('month') - 1, part('day'))
  }
}

/** `YYYY-MM-DD` of a day number. */
export const dateOf = (day: number): ActivityDate =>
  new Date(day * DAY_MS).toISOString().slice(0, 10)

/** 0 = Monday ... 6 = Sunday (day 0, 1970-01-01, was a Thursday). */
export const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7

/** Timestamps are stored as ISO 8601 strings; an unreadable one is ignored. */
function toDays(timestamps: readonly string[], dayOf: DayOf): number[] {
  const days: number[] = []
  for (const timestamp of timestamps) {
    const ms = Date.parse(timestamp)
    if (Number.isFinite(ms)) days.push(dayOf(ms))
  }
  return days
}

/** The completion times behind the Activity Days. */
export interface ActivityHistory {
  /** `completed_at` of every completed Round (passed or not). */
  roundCompletions: readonly string[]
  /** When each Protocol Step submission was reviewed (the step passed its feedback). */
  protocolStepReviews: readonly string[]
}

/** Activity Days, ascending and unique. */
export function activityDays(history: ActivityHistory, dayOf: DayOf): number[] {
  const days = new Set([
    ...toDays(history.roundCompletions, dayOf),
    ...toDays(history.protocolStepReviews, dayOf)
  ])
  return [...days].sort((a, b) => a - b)
}

const graceFree = (day: number, lastGrace: number | null) =>
  lastGrace === null || day - lastGrace >= GRACE_INTERVAL_DAYS

interface StreakRun {
  /** Activity Days of the run that ends on the last Activity Day. */
  length: number
  /** The grace days inside that run. */
  graceDays: number[]
  /** The latest grace day ever used, inside the run or not. */
  lastGrace: number | null
  lastDay: number | null
}

/** Walks the Activity Days in order, bridging one missed day when the grace day is free. */
function walk(days: readonly number[]): StreakRun {
  let length = 0
  let graceDays: number[] = []
  let lastGrace: number | null = null
  let previous: number | null = null
  for (const day of days) {
    if (previous === null) {
      length = 1
    } else {
      const missed = day - previous - 1
      if (missed === 0) {
        length += 1
      } else if (missed === 1 && graceFree(previous + 1, lastGrace)) {
        lastGrace = previous + 1
        graceDays = [...graceDays, lastGrace]
        length += 1
      } else {
        length = 1
        graceDays = []
      }
    }
    previous = day
  }
  return { length, graceDays, lastGrace, lastDay: previous }
}

/**
 * The Activity Streak on `today`. `days` are Activity Days (any order); days after `today`
 * (a clock set back) are ignored.
 */
export function activityStreak(
  days: readonly number[],
  today: number
): ActivityStreak & { graceDays: number[] } {
  const sorted = [...new Set(days)].filter((day) => day <= today).sort((a, b) => a - b)
  const run = walk(sorted)
  const todayDone = run.lastDay === today
  const sinceLast = run.lastDay === null ? Infinity : today - run.lastDay
  // Alive: active today or yesterday; or yesterday missed with the grace day free to cover it
  // (it is spent once today has activity).
  const atRisk = sinceLast === 2 && graceFree(today - 1, run.lastGrace)
  const alive = sinceLast <= 1 || atRisk
  const graceDays = alive ? run.graceDays : []
  return {
    current: alive ? run.length : 0,
    todayDone,
    atRisk: alive && atRisk,
    graceUsedOn: graceDays.length > 0 ? dateOf(graceDays[graceDays.length - 1]!) : null,
    graceAvailable: graceFree(today, run.lastGrace),
    graceDays
  }
}

/** Rounds completed on `today`, against the Daily Goal. */
export function dailyGoalProgress(
  roundCompletions: readonly string[],
  today: number,
  dayOf: DayOf,
  roundsPerDay: number
): DailyGoalProgress {
  const roundsToday = toDays(roundCompletions, dayOf).filter((day) => day === today).length
  return { roundsPerDay, roundsToday, met: roundsToday >= roundsPerDay }
}

/** Monday to Sunday of the week containing `today`. */
export function weekStrip(
  days: readonly number[],
  today: number,
  graceDays: readonly number[] = []
): ActivityWeekDay[] {
  const active = new Set(days)
  const grace = new Set(graceDays)
  const monday = today - weekdayOf(today)
  return Array.from({ length: 7 }, (_, weekday) => {
    const day = monday + weekday
    return {
      date: dateOf(day),
      weekday,
      active: active.has(day),
      grace: grace.has(day) && !active.has(day),
      isToday: day === today,
      isFuture: day > today
    }
  })
}

export interface ActivityInput extends ActivityHistory {
  /** The `dailyGoalRounds` setting. */
  dailyGoalRounds: number
  /** Current time, ms since the epoch. */
  now: number
  dayOf: DayOf
}

/** Everything the Activity cards show. */
export function buildActivitySummary(input: ActivityInput): ActivitySummary {
  const { dayOf } = input
  const today = dayOf(input.now)
  const days = activityDays(input, dayOf)
  const { graceDays, ...streak } = activityStreak(days, today)
  return {
    today: dateOf(today),
    streak,
    goal: dailyGoalProgress(input.roundCompletions, today, dayOf, input.dailyGoalRounds),
    week: weekStrip(days, today, graceDays),
    hasActivity: days.length > 0
  }
}
