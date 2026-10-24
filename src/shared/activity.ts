/**
 * Activity types shared by the main process (src/main/activity) and the Activity cards of the
 * Learning Path and the Dashboard (src/renderer/src/activity). The Activity Streak and the Daily
 * Goal are a read model: derived from the completed Rounds and the reviewed Protocol Steps every
 * time, never stored. Rules in docs/concepts/Activity Streak.md.
 */

/** Daily Goal: Rounds per day, 1 to 3, default 1 (the `dailyGoalRounds` setting). */
export const DAILY_GOAL_MIN = 1
export const DAILY_GOAL_MAX = 3
export const DEFAULT_DAILY_GOAL_ROUNDS = 1

/** A calendar date in the learner's local time, `YYYY-MM-DD`. */
export type ActivityDate = string

/** One day of the week strip (Monday first). */
export interface ActivityWeekDay {
  date: ActivityDate
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number
  /** The day is an Activity Day. */
  active: boolean
  /** A missed day the Activity Streak bridged with its grace day. */
  grace: boolean
  isToday: boolean
  /** After today: shown locked. */
  isFuture: boolean
}

export interface ActivityStreak {
  /** Activity Days in the current streak; 0 when there is none. */
  current: number
  /** Today is an Activity Day. */
  todayDone: boolean
  /**
   * The streak is alive but its last Activity Day was the day before yesterday: yesterday was
   * missed and the grace day covers it as soon as today has activity.
   */
  atRisk: boolean
  /** The most recent grace day inside the current streak; null when it used none. */
  graceUsedOn: ActivityDate | null
  /** A missed day would be covered: no grace day was used in the last 7 days. */
  graceAvailable: boolean
}

export interface DailyGoalProgress {
  /** The setting, 1 to 3. */
  roundsPerDay: number
  /** Rounds completed today (local time), passed or not. */
  roundsToday: number
  met: boolean
}

export interface ActivitySummary {
  today: ActivityDate
  streak: ActivityStreak
  goal: DailyGoalProgress
  /** Monday to Sunday of the week containing today. */
  week: ActivityWeekDay[]
  /** At least one Activity Day ever: false on a fresh install ("Start your streak"). */
  hasActivity: boolean
}
