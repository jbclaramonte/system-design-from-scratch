import { describe, expect, it } from 'vitest'
import type { ActivitySummary, ActivityWeekDay } from '../../../shared/activity'
import {
  formatActivityDate,
  goalDetail,
  goalPercent,
  goalValue,
  graceNote,
  streakDetail,
  streakHeadline,
  streakUnit,
  weekDayLabel,
  weekDayState,
  weekdayInitials,
  weekdayNames,
  weekSummary
} from './activityText'

const day = (over: Partial<ActivityWeekDay> = {}): ActivityWeekDay => ({
  date: '2026-10-21',
  weekday: 2,
  active: false,
  grace: false,
  isToday: false,
  isFuture: false,
  ...over
})

const summary = (over: Partial<ActivitySummary> = {}): ActivitySummary => ({
  today: '2026-10-21',
  streak: { current: 0, todayDone: false, atRisk: false, graceUsedOn: null, graceAvailable: true },
  goal: { roundsPerDay: 1, roundsToday: 0, met: false },
  week: [],
  hasActivity: false,
  ...over
})

describe('streak text', () => {
  it('invites a fresh install to start, with no reproach', () => {
    const fresh = summary()
    expect(streakHeadline(fresh)).toBe('Start your streak')
    expect(streakUnit(fresh)).toBe('')
    expect(streakDetail(fresh)).toBe('Complete a Round or a Protocol Step to begin.')
    expect(goalValue(fresh.goal)).toBe('0 / 1 Round')
  })

  it('invites a learner with a broken streak to start a new one', () => {
    const broken = summary({ hasActivity: true })
    expect(streakHeadline(broken)).toBe('Start a new streak')
    expect(streakDetail(broken)).toBe('Complete a Round today and a new streak begins.')
  })

  it('shows the count with its unit', () => {
    const one = summary({
      hasActivity: true,
      streak: {
        current: 1,
        todayDone: true,
        atRisk: false,
        graceUsedOn: null,
        graceAvailable: true
      }
    })
    expect(streakHeadline(one)).toBe('1')
    expect(streakUnit(one)).toBe('day streak')
    const many = summary({
      hasActivity: true,
      streak: { ...one.streak, current: 5 }
    })
    expect(streakHeadline(many)).toBe('5')
    expect(streakUnit(many)).toBe('day streak')
  })

  it('says what to do next depending on today', () => {
    const base = { current: 3, atRisk: false, graceUsedOn: null, graceAvailable: true }
    expect(streakDetail(summary({ hasActivity: true, streak: { ...base, todayDone: true } }))).toBe(
      'Today counts. See you tomorrow.'
    )
    expect(
      streakDetail(summary({ hasActivity: true, streak: { ...base, todayDone: false } }))
    ).toBe('Complete a Round today to extend it.')
    expect(
      streakDetail(
        summary({ hasActivity: true, streak: { ...base, todayDone: false, atRisk: true } })
      )
    ).toMatch(/rest day/)
  })

  it('says when the grace day was used', () => {
    expect(graceNote(summary())).toBeNull()
    const used = summary({
      hasActivity: true,
      streak: {
        current: 3,
        todayDone: true,
        atRisk: false,
        graceUsedOn: '2026-10-14',
        graceAvailable: false
      }
    })
    expect(graceNote(used)).toBe('Grace day used on Wed 14 Oct.')
  })
})

describe('Daily Goal text', () => {
  it('writes the progress as "1 / 2 Rounds"', () => {
    expect(goalValue({ roundsPerDay: 2, roundsToday: 1, met: false })).toBe('1 / 2 Rounds')
    expect(goalValue({ roundsPerDay: 1, roundsToday: 1, met: true })).toBe('1 / 1 Round')
    // More than the goal is capped in the value and said in the detail.
    expect(goalValue({ roundsPerDay: 2, roundsToday: 5, met: true })).toBe('2 / 2 Rounds')
  })

  it('says what is left, or that the goal is met', () => {
    expect(goalDetail({ roundsPerDay: 3, roundsToday: 1, met: false })).toBe(
      "2 more Rounds to reach today's goal."
    )
    expect(goalDetail({ roundsPerDay: 2, roundsToday: 1, met: false })).toBe(
      "1 more Round to reach today's goal."
    )
    expect(goalDetail({ roundsPerDay: 2, roundsToday: 2, met: true })).toBe('Daily Goal met.')
    expect(goalDetail({ roundsPerDay: 1, roundsToday: 3, met: true })).toBe(
      'Daily Goal met, 2 more Rounds on top.'
    )
  })

  it('computes the bar share, at most 100', () => {
    expect(goalPercent({ roundsPerDay: 2, roundsToday: 1, met: false })).toBe(50)
    expect(goalPercent({ roundsPerDay: 3, roundsToday: 1, met: false })).toBe(33)
    expect(goalPercent({ roundsPerDay: 1, roundsToday: 4, met: true })).toBe(100)
    expect(goalPercent({ roundsPerDay: 1, roundsToday: 0, met: false })).toBe(0)
  })
})

describe('week strip text', () => {
  it('starts on Monday', () => {
    expect(weekdayInitials).toHaveLength(7)
    expect(weekdayNames[0]).toBe('Monday')
    expect(weekdayNames[6]).toBe('Sunday')
  })

  it('formats calendar dates without a time zone shift', () => {
    expect(formatActivityDate('2026-10-21')).toBe('Wed 21 Oct')
    expect(formatActivityDate('2026-10-21', true)).toBe('Wednesday 21 October')
    expect(formatActivityDate('2026-01-01', true)).toBe('Thursday 1 January')
    expect(formatActivityDate('nope')).toBe('nope')
  })

  it('gives each day one state, and a text alternative that does not rely on colour', () => {
    expect(weekDayState(day({ active: true }))).toBe('done')
    expect(weekDayState(day({ grace: true }))).toBe('grace')
    expect(weekDayState(day({ isToday: true }))).toBe('today')
    expect(weekDayState(day({ isFuture: true }))).toBe('future')
    expect(weekDayState(day())).toBe('none')

    expect(weekDayLabel(day({ active: true }))).toBe('Wednesday 21 October: done')
    expect(weekDayLabel(day({ active: true, isToday: true }))).toBe(
      'Wednesday 21 October: today, done'
    )
    expect(weekDayLabel(day({ isToday: true }))).toBe('Wednesday 21 October: today, not done yet')
    expect(weekDayLabel(day({ isFuture: true }))).toBe(
      'Wednesday 21 October: locked, not reached yet'
    )
    expect(weekDayLabel(day({ grace: true }))).toMatch(/grace day/)
    expect(weekDayLabel(day())).toBe('Wednesday 21 October: no activity')
  })

  it('counts the done days of the week', () => {
    expect(
      weekSummary(summary({ week: [day({ active: true }), day(), day({ active: true })] }))
    ).toBe('2 of 7 days done this week.')
  })
})
