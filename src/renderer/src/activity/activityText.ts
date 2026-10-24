// Labels of the Activity cards (Activity Streak, week strip, Daily Goal). Pure and tested. The
// wording is calm on purpose: a fresh install or a broken streak is an invitation, never a
// reproach, and nothing is "missed" in words that scold.
import type { ActivitySummary, ActivityWeekDay, DailyGoalProgress } from '../../../shared/activity'

/** Monday first. */
export const weekdayInitials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const
export const weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
] as const

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

/** "Wed 14 Oct" or, with `long`, "Wednesday 14 October" (the date is a calendar date, no zone). */
export function formatActivityDate(date: string, long = false): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : 'short'
  })
}

/** The big line of the Streak card. */
export function streakHeadline(summary: ActivitySummary): string {
  const { current } = summary.streak
  if (current > 0) return `${current}`
  return summary.hasActivity ? 'Start a new streak' : 'Start your streak'
}

/** The unit after the streak number; empty when the headline is a sentence. */
export const streakUnit = (summary: ActivitySummary): string =>
  summary.streak.current > 0 ? 'day streak' : ''

/** One calm line under the headline. */
export function streakDetail(summary: ActivitySummary): string {
  const { streak, hasActivity } = summary
  if (streak.current === 0) {
    return hasActivity
      ? 'Complete a Round today and a new streak begins.'
      : 'Complete a Round or a Protocol Step to begin.'
  }
  if (streak.todayDone) return 'Today counts. See you tomorrow.'
  if (streak.atRisk) return 'Yesterday was a rest day. Complete a Round today to keep your streak.'
  return 'Complete a Round today to extend it.'
}

/** The grace line, only when the current streak used its grace day. */
export const graceNote = (summary: ActivitySummary): string | null =>
  summary.streak.graceUsedOn
    ? `Grace day used on ${formatActivityDate(summary.streak.graceUsedOn)}.`
    : null

/** "1 / 2 Rounds": today's Rounds over the Daily Goal (never above the goal). */
export const goalValue = (goal: DailyGoalProgress): string =>
  `${Math.min(goal.roundsToday, goal.roundsPerDay)} / ${goal.roundsPerDay} ${plural(goal.roundsPerDay, 'Round', 'Rounds')}`

export function goalDetail(goal: DailyGoalProgress): string {
  if (goal.met) {
    const extra = goal.roundsToday - goal.roundsPerDay
    return extra > 0
      ? `Daily Goal met, ${extra} more ${plural(extra, 'Round', 'Rounds')} on top.`
      : 'Daily Goal met.'
  }
  const left = goal.roundsPerDay - goal.roundsToday
  return `${left} more ${plural(left, 'Round', 'Rounds')} to reach today's goal.`
}

export const goalPercent = (goal: DailyGoalProgress): number =>
  Math.min(100, Math.round((goal.roundsToday / goal.roundsPerDay) * 100))

export type WeekDayState = 'done' | 'grace' | 'today' | 'future' | 'none'

/** The state shown for a day: done days and the grace day first, then today, the future. */
export function weekDayState(day: ActivityWeekDay): WeekDayState {
  if (day.active) return 'done'
  if (day.grace) return 'grace'
  if (day.isToday) return 'today'
  if (day.isFuture) return 'future'
  return 'none'
}

/** The text alternative of a day, read by screen readers: "Wednesday 21 October: today, done". */
export function weekDayLabel(day: ActivityWeekDay): string {
  const name = formatActivityDate(day.date, true)
  const state = weekDayState(day)
  const status = {
    done: day.isToday ? 'today, done' : 'done',
    grace: 'grace day, the streak continues',
    today: 'today, not done yet',
    future: 'locked, not reached yet',
    none: 'no activity'
  }[state]
  return `${name}: ${status}`
}

/** One sentence for the whole strip, for the list's description. */
export function weekSummary(summary: ActivitySummary): string {
  const done = summary.week.filter((day) => day.active).length
  return `${done} of 7 days done this week.`
}
