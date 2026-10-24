import { describe, expect, it } from 'vitest'
import {
  activityDays,
  activityStreak,
  buildActivitySummary,
  dailyGoalProgress,
  dateOf,
  dayOfInZone,
  systemDayOf,
  weekdayOf,
  weekStrip,
  type DayOf
} from './activity'

const utc = dayOfInZone('UTC')
const paris = dayOfInZone('Europe/Paris')
const newYork = dayOfInZone('America/New_York')

/** Wednesday 21 October 2026, 10:00 UTC. */
const NOW = Date.parse('2026-10-21T10:00:00.000Z')
const TODAY = utc(NOW)

/** A noon timestamp `ago` days before NOW (0 = today). */
const noon = (ago: number) => dateOf(TODAY - ago) + 'T12:00:00.000Z'

const summary = (
  roundCompletions: string[],
  options: {
    protocolStepReviews?: string[]
    dailyGoalRounds?: number
    now?: number
    dayOf?: DayOf
  } = {}
) =>
  buildActivitySummary({
    roundCompletions,
    protocolStepReviews: options.protocolStepReviews ?? [],
    dailyGoalRounds: options.dailyGoalRounds ?? 1,
    now: options.now ?? NOW,
    dayOf: options.dayOf ?? utc
  })

/** Rounds completed `ago` days before NOW, one per entry. */
const rounds = (...ago: number[]) => ago.map(noon)

describe('days and weekdays', () => {
  it('converts day numbers to dates and Monday-first weekdays', () => {
    expect(dateOf(0)).toBe('1970-01-01')
    expect(dateOf(TODAY)).toBe('2026-10-21')
    expect(weekdayOf(0)).toBe(3) // Thursday
    expect(weekdayOf(TODAY)).toBe(2) // Wednesday
    expect(weekdayOf(TODAY - 2)).toBe(0) // Monday
    expect(weekdayOf(TODAY + 4)).toBe(6) // Sunday
    expect(weekdayOf(-1)).toBe(2) // 1969-12-31, a Wednesday
  })

  it('gives the same day number for the machine zone as for its own calendar date', () => {
    const date = new Date(2026, 9, 21, 23, 59, 59)
    expect(dateOf(systemDayOf(date.getTime()))).toBe('2026-10-21')
    const next = new Date(2026, 9, 22, 0, 0, 0)
    expect(dateOf(systemDayOf(next.getTime()))).toBe('2026-10-22')
  })
})

describe('activity days', () => {
  it('merges completed Rounds and reviewed Protocol Steps, unique and ascending', () => {
    const days = activityDays(
      {
        roundCompletions: [noon(0), noon(0), noon(3)],
        protocolStepReviews: [noon(1), noon(3)]
      },
      utc
    )
    expect(days).toEqual([TODAY - 3, TODAY - 1, TODAY])
  })

  it('ignores an unreadable timestamp', () => {
    expect(
      activityDays({ roundCompletions: ['not a date', ''], protocolStepReviews: [] }, utc)
    ).toEqual([])
  })

  it('counts a Protocol Step review as an Activity Day', () => {
    const result = summary([], { protocolStepReviews: [noon(0)] })
    expect(result.streak.current).toBe(1)
    expect(result.streak.todayDone).toBe(true)
    // A Protocol Step is not a Round: the Daily Goal does not move.
    expect(result.goal).toEqual({ roundsPerDay: 1, roundsToday: 0, met: false })
  })
})

describe('Activity Streak', () => {
  it('is empty on a fresh install', () => {
    const result = summary([])
    expect(result.hasActivity).toBe(false)
    expect(result.streak).toEqual({
      current: 0,
      todayDone: false,
      atRisk: false,
      graceUsedOn: null,
      graceAvailable: true
    })
    expect(result.week.every((day) => !day.active && !day.grace)).toBe(true)
  })

  it('counts today only as 1', () => {
    expect(summary(rounds(0)).streak).toMatchObject({ current: 1, todayDone: true, atRisk: false })
  })

  it('keeps a streak that ended yesterday while today has no activity yet', () => {
    const result = summary(rounds(3, 2, 1))
    expect(result.streak).toMatchObject({ current: 3, todayDone: false, atRisk: false })
    expect(summary(rounds(1)).streak.current).toBe(1)
  })

  it('counts consecutive days ending today', () => {
    expect(summary(rounds(4, 3, 2, 1, 0)).streak.current).toBe(5)
  })

  it('bridges a gap of one missed day with the grace day and says when', () => {
    // Active 3 days ago and 2 days ago, missed yesterday, active today.
    const result = summary(rounds(3, 2, 0))
    expect(result.streak.current).toBe(3)
    expect(result.streak.graceUsedOn).toBe(dateOf(TODAY - 1))
    expect(result.streak.graceAvailable).toBe(false)
    expect(result.week.find((day) => day.date === dateOf(TODAY - 1))).toMatchObject({
      active: false,
      grace: true
    })
  })

  it('keeps a streak alive, at risk, when only yesterday was missed and the grace day is free', () => {
    const result = summary(rounds(3, 2))
    expect(result.streak).toMatchObject({
      current: 2,
      todayDone: false,
      atRisk: true,
      graceUsedOn: null
    })
    // Doing a Round today spends the grace day and extends the streak.
    expect(summary(rounds(3, 2, 0)).streak).toMatchObject({ current: 3, atRisk: false })
  })

  it('breaks on a gap of two missed days', () => {
    expect(summary(rounds(4, 3, 0)).streak.current).toBe(1)
    // Two missed days and nothing today: no streak.
    expect(summary(rounds(5, 4, 3)).streak).toMatchObject({ current: 0, atRisk: false })
    expect(summary(rounds(3)).streak.current).toBe(0)
    expect(summary(rounds(3, 2, 1)).streak.current).toBe(3)
  })

  it('does not grace a second missed day within 7 days of the first grace day', () => {
    // Active days 9, 8, [7 missed: grace], 6, 5, [4 missed: 3 days after the grace], 3.
    const result = summary(rounds(9, 8, 6, 5, 3, 2, 1))
    expect(result.streak.current).toBe(3)
    expect(result.streak.graceUsedOn).toBeNull()
    // Active again today after that second miss: the new streak holds.
    expect(summary(rounds(9, 8, 6, 5, 3, 2, 1, 0)).streak.current).toBe(4)
  })

  it('allows the next grace day exactly 7 days after the previous one', () => {
    // Grace days at ago=14 and ago=7 (7 days apart); every other day is active.
    const active = [15, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 1, 0]
    const result = summary(rounds(...active))
    expect(result.streak.current).toBe(active.length)
    expect(result.streak.graceUsedOn).toBe(dateOf(TODAY - 7))
    // 6 days apart (grace at ago=13 and ago=7) is one too soon: the second miss breaks it.
    const tooSoon = [14, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2, 1, 0]
    expect(summary(rounds(...tooSoon)).streak.current).toBe(7)
  })

  it('decides in chronological order: adding a later day never changes an earlier verdict', () => {
    const base = [20, 19, 17, 16, 14] // grace at ago=18 then a second miss at ago=15 (3 days later)
    const before = activityStreak(
      base.map((ago) => TODAY - ago),
      TODAY - 14
    )
    const after = activityStreak(
      [...base, 13, 12].map((ago) => TODAY - ago),
      TODAY - 12
    )
    expect(before.current).toBe(1)
    expect(after.current).toBe(3)
  })

  it('counts a long streak only through Activity Days, not grace days', () => {
    expect(summary(rounds(6, 5, 4, 3, 2, 1, 0)).streak.current).toBe(7)
    expect(summary(rounds(6, 5, 3, 2, 1, 0)).streak.current).toBe(6)
  })

  it('keeps the spent grace day after a break: the 7 days still count', () => {
    // Grace at ago=7 (active 8 and 6), then two missed days (5, 4) break the streak; active 3,
    // missed 2 (only 5 days after the first grace): broken again.
    const result = summary(rounds(8, 6, 3, 1, 0))
    expect(result.streak.current).toBe(2)
  })

  it('ignores activity dated after today (clock set back)', () => {
    const result = summary([noon(-3), noon(-2)])
    expect(result.streak.current).toBe(0)
    expect(result.hasActivity).toBe(true)
  })

  it('counts many Rounds in one day as a single Activity Day', () => {
    const many = Array.from({ length: 12 }, (_, i) => dateOf(TODAY) + `T0${i % 9}:00:00.000Z`)
    const result = summary(many, { dailyGoalRounds: 3 })
    expect(result.streak.current).toBe(1)
    expect(result.goal).toEqual({ roundsPerDay: 3, roundsToday: 12, met: true })
  })

  it('is not changed by a Declared Mastery or a Forced Unlock: they are not inputs', () => {
    // Only completed Rounds and reviewed Protocol Steps are read (src/main/activity/activityIpc);
    // the database test checks that rows in `declared_masteries` and `forced_unlocks` add nothing.
    expect(summary([]).streak.current).toBe(0)
    expect(summary(rounds(1)).streak.current).toBe(1)
  })
})

describe('day boundaries', () => {
  it('changes day at local midnight, not at UTC midnight', () => {
    // Paris in winter is UTC+1: 23:59:59 local on 14 January, then 00:00:00 on the 15th.
    const lastSecond = Date.parse('2026-01-14T22:59:59.000Z')
    const midnight = Date.parse('2026-01-14T23:00:00.000Z')
    expect(dateOf(paris(lastSecond))).toBe('2026-01-14')
    expect(dateOf(paris(midnight))).toBe('2026-01-15')
    // Evening in New York (UTC-5) is already the next day in UTC.
    expect(dateOf(newYork(Date.parse('2026-01-15T03:00:00.000Z')))).toBe('2026-01-14')

    const result = summary(['2026-01-14T22:59:59.000Z', '2026-01-14T23:00:00.000Z'], {
      now: Date.parse('2026-01-15T10:00:00.000Z'),
      dayOf: paris
    })
    expect(result.streak.current).toBe(2)
    expect(result.goal.roundsToday).toBe(1)
  })

  it('moves a Round done just after local midnight to the new day for the Daily Goal', () => {
    const now = Date.parse('2026-01-15T10:00:00.000Z')
    const before = summary(['2026-01-14T22:59:59.000Z'], { now, dayOf: paris })
    expect(before.goal.roundsToday).toBe(0)
    expect(before.streak).toMatchObject({ current: 1, todayDone: false })
    const after = summary(['2026-01-14T23:00:00.000Z'], { now, dayOf: paris })
    expect(after.goal.roundsToday).toBe(1)
    expect(after.streak).toMatchObject({ current: 1, todayDone: true })
  })

  it('keeps a streak across the spring-forward day (23 hours long)', () => {
    // Europe/Paris, 29 March 2026: 02:00 jumps to 03:00. Noon every day.
    const result = summary(
      ['2026-03-28T11:00:00.000Z', '2026-03-29T10:00:00.000Z', '2026-03-30T10:00:00.000Z'],
      { now: Date.parse('2026-03-30T12:00:00.000Z'), dayOf: paris }
    )
    expect(result.streak.current).toBe(3)
    expect(result.streak.graceUsedOn).toBeNull()
    expect(result.week.map((day) => day.date)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05'
    ])
  })

  it('places the last minute of the 23-hour day and the first of the next correctly', () => {
    // The day of 29 March lasts from 28 March 23:00Z to 29 March 22:00Z.
    expect(dateOf(paris(Date.parse('2026-03-28T22:59:59.000Z')))).toBe('2026-03-28')
    expect(dateOf(paris(Date.parse('2026-03-28T23:00:00.000Z')))).toBe('2026-03-29')
    expect(dateOf(paris(Date.parse('2026-03-29T21:59:59.000Z')))).toBe('2026-03-29')
    expect(dateOf(paris(Date.parse('2026-03-29T22:00:00.000Z')))).toBe('2026-03-30')
  })

  it('counts two days only 23 hours apart as consecutive, not as a gap', () => {
    // 23:30 local on 28 March (22:30Z) and 00:30 local on 30 March... is one missed day;
    // 23:30 local on 28 March and 23:00 local on 29 March are 23 hours apart: consecutive.
    const result = summary(['2026-03-28T22:30:00.000Z', '2026-03-29T21:00:00.000Z'], {
      now: Date.parse('2026-03-29T21:30:00.000Z'),
      dayOf: paris
    })
    expect(result.streak).toMatchObject({ current: 2, todayDone: true, graceUsedOn: null })
  })

  it('keeps a streak across the fall-back day (25 hours long)', () => {
    // 25 October 2026: 03:00 falls back to 02:00. The day lasts 24 Oct 22:00Z to 25 Oct 23:00Z.
    expect(dateOf(paris(Date.parse('2026-10-25T22:59:59.000Z')))).toBe('2026-10-25')
    expect(dateOf(paris(Date.parse('2026-10-25T23:00:00.000Z')))).toBe('2026-10-26')
    // Two activities 25 hours apart can still be on two different days, and one on each side of
    // the 25-hour day never makes a phantom gap.
    const result = summary(
      ['2026-10-24T22:30:00.000Z', '2026-10-25T23:30:00.000Z', '2026-10-26T12:00:00.000Z'],
      { now: Date.parse('2026-10-26T13:00:00.000Z'), dayOf: paris }
    )
    // Local times: 25 Oct 00:30, 26 Oct 00:30 and 26 Oct 13:00, so two days.
    expect(result.streak.current).toBe(2)
    const week = summary(
      [
        '2026-10-23T10:00:00.000Z',
        '2026-10-24T10:00:00.000Z',
        '2026-10-25T10:00:00.000Z',
        '2026-10-26T10:00:00.000Z'
      ],
      { now: Date.parse('2026-10-26T11:00:00.000Z'), dayOf: paris }
    )
    expect(week.streak.current).toBe(4)
    // Monday 26 starts the week: the 23rd to the 25th belong to the previous one.
    expect(week.week.filter((day) => day.active).map((day) => day.date)).toEqual(['2026-10-26'])
  })
})

describe('Daily Goal', () => {
  it("counts only today's completed Rounds, whatever their outcome", () => {
    const goal = dailyGoalProgress([noon(1), noon(0), noon(0)], TODAY, utc, 2)
    expect(goal).toEqual({ roundsPerDay: 2, roundsToday: 2, met: true })
    expect(dailyGoalProgress([noon(1), noon(0)], TODAY, utc, 2)).toMatchObject({
      roundsToday: 1,
      met: false
    })
  })

  it('defaults to 1 Round on a fresh install with nothing done', () => {
    expect(summary([]).goal).toEqual({ roundsPerDay: 1, roundsToday: 0, met: false })
  })
})

describe('week strip', () => {
  it('runs Monday to Sunday around today, locks the future, marks today', () => {
    const week = weekStrip([TODAY - 2, TODAY - 1], TODAY)
    expect(week.map((day) => day.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25'
    ])
    expect(week.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(week.map((day) => day.active)).toEqual([true, true, false, false, false, false, false])
    expect(week.map((day) => day.isToday)).toEqual([false, false, true, false, false, false, false])
    expect(week.map((day) => day.isFuture)).toEqual([false, false, false, true, true, true, true])
  })

  it('starts on Monday when today is Monday or Sunday', () => {
    const monday = TODAY - 2
    expect(weekStrip([], monday)[0]).toMatchObject({ date: '2026-10-19', isToday: true })
    const sunday = TODAY + 4
    expect(weekStrip([], sunday)[0]).toMatchObject({ date: '2026-10-19', isFuture: false })
    expect(weekStrip([], sunday)[6]).toMatchObject({ date: '2026-10-25', isToday: true })
  })

  it('shows the done days of a streak that began last week', () => {
    const result = summary(rounds(5, 4, 3, 2, 1, 0))
    expect(result.week.filter((day) => day.active).map((day) => day.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21'
    ])
  })
})
