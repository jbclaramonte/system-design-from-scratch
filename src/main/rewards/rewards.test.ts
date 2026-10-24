import { describe, expect, it } from 'vitest'
import { BADGES, LEVELS, XP_RULES, badgeIcons, type BadgeDefinition } from '../../shared/rewards'
import { dayOfInZone } from '../activity/activity'
import {
  badgeUnlocks,
  buildRewardsSummary,
  emptyLedger,
  levelProgress,
  payEvent,
  roundXp,
  roundXpAwards,
  totalXp,
  xpEvents,
  type RewardHistory,
  type RewardRound
} from './rewards'

const utc = dayOfInZone('UTC')
const NOW = Date.parse('2026-10-24T12:00:00.000Z')

const history = (over: Partial<RewardHistory> = {}): RewardHistory => ({
  topics: [
    { id: 1, inFoundations: true },
    { id: 2, inFoundations: true },
    { id: 3, inFoundations: false }
  ],
  rounds: [],
  protocolStepReviews: [],
  designExerciseCompletions: [],
  ...over
})

let nextId = 0
const round = (
  topicId: number,
  completedAt: string | null,
  scorePercent: number | null,
  passed: boolean | null,
  id = ++nextId
): RewardRound => ({ id, topicId, completedAt, scorePercent, passed })

const pass = (topicId: number, at: string, score = 100, id?: number) =>
  round(topicId, at, score, true, id)
const fail = (topicId: number, at: string, score = 40, id?: number) =>
  round(topicId, at, score, false, id)

const day = (n: number, time = '10:00:00') => `2026-10-${String(n).padStart(2, '0')}T${time}.000Z`

describe('XP of a Round', () => {
  it('pays the score, plus a bonus when passed', () => {
    expect(roundXp(100, true)).toBe(30) // "+30 XP: Round passed"
    expect(roundXp(85, true)).toBe(XP_RULES.roundPassedBonus + 17)
    expect(roundXp(40, false)).toBe(8)
    expect(roundXp(0, false)).toBe(0)
    expect(roundXp(100, false)).toBe(20)
  })

  it('clamps a score outside 0 to 100', () => {
    expect(roundXp(130, true)).toBe(30)
    expect(roundXp(-5, false)).toBe(0)
  })
})

describe('xpEvents', () => {
  it('pays nothing for an empty history', () => {
    expect(xpEvents(history())).toEqual([])
    expect(totalXp(xpEvents(history()))).toBe(0)
  })

  it('pays a passed Round and the first mastery of its Topic', () => {
    const events = xpEvents(history({ rounds: [pass(1, day(1), 100, 10)] }))
    expect(events.map((e) => [e.key, e.kind, e.xp, e.roundId])).toEqual([
      ['round:10', 'round_passed', 30, 10],
      ['topic:1', 'topic_mastered', XP_RULES.topicMastered, 10]
    ])
    expect(events[0]!.reason).toBe('Round passed')
  })

  it('pays a failed Round its score only, with no Topic mastery', () => {
    const events = xpEvents(history({ rounds: [fail(1, day(1), 40, 11)] }))
    expect(events.map((e) => [e.kind, e.xp])).toEqual([['round_completed', 8]])
  })

  it('pays the Topic mastery once, on the first pass, and each Round once', () => {
    const rounds = [fail(1, day(1), 40, 1), pass(1, day(2), 100, 2), pass(1, day(3), 100, 3)]
    const events = xpEvents(history({ rounds }))
    expect(events.filter((e) => e.kind === 'topic_mastered')).toHaveLength(1)
    expect(events.find((e) => e.kind === 'topic_mastered')!.roundId).toBe(2)
    // 8 + (30 + 50) + 30
    expect(totalXp(events)).toBe(118)
  })

  it('pays a Round once even when the same Round is listed twice', () => {
    const r = pass(1, day(1), 100, 7)
    expect(totalXp(xpEvents(history({ rounds: [r, r] })))).toBe(80)
  })

  it('pays nothing for an open Round or one without a score', () => {
    const rounds = [round(1, null, null, null), round(1, day(1), null, null)]
    expect(xpEvents(history({ rounds }))).toEqual([])
  })

  it('pays a Protocol Step once per exercise and step', () => {
    const events = xpEvents(
      history({
        protocolStepReviews: [
          { designExerciseId: 1, protocolStep: 'api', reviewedAt: day(1) },
          { designExerciseId: 1, protocolStep: 'api', reviewedAt: day(2) },
          { designExerciseId: 1, protocolStep: 'data_model', reviewedAt: day(2) },
          { designExerciseId: 2, protocolStep: 'api', reviewedAt: day(3) }
        ]
      })
    )
    expect(events.map((e) => e.key)).toEqual(['step:1:api', 'step:1:data_model', 'step:2:api'])
    expect(totalXp(events)).toBe(3 * XP_RULES.protocolStepPassed)
  })

  it('pays a Design Exercise once, at its earliest final review', () => {
    const events = xpEvents(
      history({
        designExerciseCompletions: [
          { designExerciseId: 1, completedAt: day(5) },
          { designExerciseId: 1, completedAt: day(2) }
        ]
      })
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ xp: 100, at: day(2) })
  })

  it('lists events oldest first', () => {
    const events = xpEvents(
      history({
        rounds: [pass(1, day(4))],
        protocolStepReviews: [{ designExerciseId: 1, protocolStep: 'api', reviewedAt: day(2) }]
      })
    )
    expect(events.map((e) => e.at)).toEqual([day(2), day(4), day(4)])
  })

  it('has no input for a Declared Mastery, a Forced Unlock or a Lesson: they pay nothing', () => {
    // Topics exist, nothing was played: whatever else is stored, the XP stays 0.
    const quiet = history({ topics: [{ id: 1, inFoundations: true }] })
    expect(totalXp(xpEvents(quiet))).toBe(0)
    expect(badgeUnlocks({ history: quiet, dayOf: utc, now: NOW }).size).toBe(0)
  })
})

describe('Level', () => {
  it('is a function of total XP with named levels', () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, name: 'Novice', xpToNext: 100, percent: 0 })
    expect(levelProgress(99)).toMatchObject({ level: 1, xpToNext: 1, percent: 99 })
    expect(levelProgress(100)).toMatchObject({
      level: 2,
      name: 'Apprentice',
      xpIntoLevel: 0,
      xpForLevel: 150,
      nextName: 'Builder'
    })
    expect(levelProgress(175)).toMatchObject({ level: 2, xpIntoLevel: 75, percent: 50 })
  })

  it('stops at the top Level', () => {
    const top = LEVELS[LEVELS.length - 1]!
    expect(levelProgress(top.minXp)).toMatchObject({
      level: top.level,
      name: top.name,
      xpToNext: null,
      xpForLevel: null,
      nextName: null
    })
    expect(levelProgress(top.minXp + 5000)).toMatchObject({
      level: top.level,
      xpToNext: null,
      nextName: null,
      percent: 100
    })
  })

  it('never goes below Level 1', () => {
    expect(levelProgress(-50).level).toBe(1)
    expect(levelProgress(-50).xp).toBe(0)
  })

  it('has strictly ascending thresholds that start at 0, numbered from 1', () => {
    expect(LEVELS[0]!.minXp).toBe(0)
    LEVELS.forEach((level, i) => {
      expect(level.level).toBe(i + 1)
      if (i > 0) expect(level.minXp).toBeGreaterThan(LEVELS[i - 1]!.minXp)
    })
  })
})

describe('Badges', () => {
  const unlocks = (h: RewardHistory) => badgeUnlocks({ history: h, dayOf: utc, now: NOW })

  it('has unique ids and a known icon each', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length)
    for (const badge of BADGES) {
      expect(badgeIcons).toContain(badge.icon)
      expect(badge.rule.length).toBeGreaterThan(10)
    }
  })

  it('First Topic mastered: the first passed Round, not a failed one', () => {
    expect(unlocks(history({ rounds: [fail(1, day(1))] })).has('first-topic-mastered')).toBe(false)
    const result = unlocks(history({ rounds: [fail(1, day(1)), pass(1, day(2)), pass(3, day(3))] }))
    expect(result.get('first-topic-mastered')).toBe(day(2))
  })

  it('Foundations complete: every Foundations Topic passed, dated by the last one', () => {
    const one = history({ rounds: [pass(1, day(1))] })
    expect(unlocks(one).has('foundations-completed')).toBe(false)
    // A primer Topic does not stand in for a Foundations one.
    expect(
      unlocks(history({ rounds: [pass(1, day(1)), pass(3, day(2))] })).has('foundations-completed')
    ).toBe(false)
    const both = history({ rounds: [pass(2, day(3)), pass(1, day(1))] })
    expect(unlocks(both).get('foundations-completed')).toBe(day(3))
  })

  it('Foundations complete needs Foundations Topics to exist', () => {
    const none = history({ topics: [{ id: 3, inFoundations: false }], rounds: [pass(3, day(1))] })
    expect(unlocks(none).has('foundations-completed')).toBe(false)
  })

  it('Perfect Round: 100% on a completed Round only', () => {
    expect(unlocks(history({ rounds: [pass(1, day(1), 99.9)] })).has('perfect-round')).toBe(false)
    expect(unlocks(history({ rounds: [round(1, null, 100, null)] })).has('perfect-round')).toBe(
      false
    )
    const result = unlocks(history({ rounds: [pass(1, day(1), 90), pass(3, day(2), 100)] }))
    expect(result.get('perfect-round')).toBe(day(2))
  })

  it('Comeback: a pass after a failed Round on the same Topic', () => {
    // A pass with no failure before it is not a comeback.
    expect(unlocks(history({ rounds: [pass(1, day(1))] })).has('comeback')).toBe(false)
    // A failure on another Topic does not count.
    expect(unlocks(history({ rounds: [fail(2, day(1)), pass(1, day(2))] })).has('comeback')).toBe(
      false
    )
    // A failure after the pass is not before it.
    expect(unlocks(history({ rounds: [pass(1, day(1)), fail(1, day(2))] })).has('comeback')).toBe(
      false
    )
    // Still failing is not a comeback yet.
    expect(unlocks(history({ rounds: [fail(1, day(1)), fail(1, day(2))] })).has('comeback')).toBe(
      false
    )
    const result = unlocks(history({ rounds: [fail(1, day(1)), fail(1, day(2)), pass(1, day(3))] }))
    expect(result.get('comeback')).toBe(day(3))
  })

  it('Comeback orders Rounds by completion time, not by id', () => {
    const rounds = [pass(1, day(5), 100, 1), fail(1, day(6), 40, 2)]
    expect(unlocks(history({ rounds })).has('comeback')).toBe(false)
    const later = [pass(1, day(7), 100, 3), ...rounds]
    expect(unlocks(history({ rounds: later })).get('comeback')).toBe(day(7))
  })

  const streakRounds = (days: number[]) => days.map((d) => pass(3, day(d, '09:00:00')))

  it('7-day Activity Streak: seven Activity Days in a row, dated by the seventh', () => {
    expect(unlocks(history({ rounds: streakRounds([1, 2, 3, 4, 5, 6]) })).has('streak-7')).toBe(
      false
    )
    const result = unlocks(history({ rounds: streakRounds([1, 2, 3, 4, 5, 6, 7]) }))
    expect(result.get('streak-7')).toBe(day(7, '09:00:00'))
  })

  it('7-day Activity Streak uses the grace day and counts reviewed Protocol Steps', () => {
    // Day 4 missed: the grace day bridges it, so day 8 is the seventh Activity Day.
    const rounds = streakRounds([1, 2, 3, 5, 6, 7])
    const reviews = [{ designExerciseId: 1, protocolStep: 'api', reviewedAt: day(8, '18:00:00') }]
    const result = unlocks(history({ rounds, protocolStepReviews: reviews }))
    expect(result.get('streak-7')).toBe(day(8, '18:00:00'))
  })

  it('7-day Activity Streak stays earned when the streak ends', () => {
    const rounds = streakRounds([1, 2, 3, 4, 5, 6, 7])
    expect(unlocks(history({ rounds })).has('streak-7')).toBe(true)
    // "Now" is weeks later: the streak is 0 but the Badge was reached.
    const later = badgeUnlocks({
      history: history({ rounds }),
      dayOf: utc,
      now: Date.parse('2026-12-24T00:00:00Z')
    })
    expect(later.has('streak-7')).toBe(true)
  })

  it('7-day Activity Streak is not reached by two missed days', () => {
    expect(unlocks(history({ rounds: streakRounds([1, 2, 3, 6, 7, 8, 9]) })).has('streak-7')).toBe(
      false
    )
  })

  it('first Design Exercise completed: the final review', () => {
    expect(unlocks(history()).has('first-design-exercise')).toBe(false)
    const result = unlocks(
      history({ designExerciseCompletions: [{ designExerciseId: 2, completedAt: day(9) }] })
    )
    expect(result.get('first-design-exercise')).toBe(day(9))
  })

  it('adding a Badge of an existing kind is a data change', () => {
    const three: BadgeDefinition = {
      id: 'three-topics',
      title: 'Three Topics',
      rule: 'Master three Topics by passing Rounds.',
      icon: 'seedling',
      criterion: { kind: 'topics_mastered', count: 3 }
    }
    const h = history({ rounds: [pass(1, day(1)), pass(2, day(2)), pass(3, day(3))] })
    const result = badgeUnlocks({ history: h, dayOf: utc, now: NOW, badges: [...BADGES, three] })
    expect(result.get('three-topics')).toBe(day(3))
    const summary = buildRewardsSummary({ history: h, dayOf: utc, now: NOW, badges: [three] })
    expect(summary.badges).toEqual([
      expect.objectContaining({ id: 'three-topics', earned: true, unlockedAt: day(3) })
    ])
  })
})

describe('rewards summary', () => {
  it('is Level 1 with every Badge locked on a fresh install', () => {
    const summary = buildRewardsSummary({ history: history(), dayOf: utc, now: NOW })
    expect(summary.xp).toBe(0)
    expect(summary.level).toMatchObject({ level: 1, name: 'Novice' })
    expect(summary.badges).toHaveLength(BADGES.length)
    expect(summary.badges.every((b) => !b.earned && b.unlockedAt === null)).toBe(true)
  })

  it('totals the XP and lists the earned Badges with their date', () => {
    const rounds = [fail(1, day(1)), pass(1, day(2), 100)]
    const summary = buildRewardsSummary({ history: history({ rounds }), dayOf: utc, now: NOW })
    expect(summary.xp).toBe(8 + 30 + 50)
    const earned = summary.badges.filter((b) => b.earned).map((b) => b.id)
    expect(earned).toEqual(['first-topic-mastered', 'perfect-round', 'comeback'])
  })
})

describe('what a Round paid', () => {
  it('lists the Round and, on the first pass, the Topic', () => {
    const rounds = [pass(1, day(1), 100, 21), pass(1, day(2), 100, 22)]
    const first = roundXpAwards(history({ rounds }), 21)
    expect(first.total).toBe(80)
    expect(first.awards.map((a) => `+${a.xp} XP: ${a.reason}`)).toEqual([
      '+30 XP: Round passed',
      '+50 XP: Topic mastered'
    ])
    expect(roundXpAwards(history({ rounds }), 22).awards.map((a) => a.xp)).toEqual([30])
  })

  it('lists nothing for a Round that paid 0 XP', () => {
    const awards = roundXpAwards(history({ rounds: [fail(1, day(1), 0, 30)] }), 30)
    expect(awards).toEqual({ roundId: 30, total: 0, awards: [] })
  })
})

describe('recomputation equals incremental computation', () => {
  // A learner's life, in the order it happened.
  const lifeRounds = [
    fail(1, day(1), 40, 1),
    pass(1, day(2), 90, 2),
    pass(2, day(3), 100, 3),
    fail(3, day(3, '15:00:00'), 20, 4),
    pass(3, day(4), 100, 5),
    pass(3, day(5), 100, 6)
  ]
  const reviews = [
    { designExerciseId: 1, protocolStep: 'functional_requirements', reviewedAt: day(6) },
    { designExerciseId: 1, protocolStep: 'functional_requirements', reviewedAt: day(7) },
    { designExerciseId: 1, protocolStep: 'api', reviewedAt: day(7, '11:00:00') }
  ]
  const completions = [{ designExerciseId: 1, completedAt: day(8) }]
  const full = history({
    rounds: lifeRounds,
    protocolStepReviews: reviews,
    designExerciseCompletions: completions
  })

  it('gives the same XP whether computed at once or event by event', () => {
    const recomputed = totalXp(xpEvents(full))
    let ledger = emptyLedger()
    for (const next of xpEvents(full)) ledger = payEvent(ledger, next)
    // Paying every event twice changes nothing.
    for (const next of xpEvents(full)) ledger = payEvent(ledger, next)
    expect(ledger.xp).toBe(recomputed)
    expect(recomputed).toBeGreaterThan(0)
  })

  it('never changes an event already paid when history grows', () => {
    const steps: RewardHistory[] = []
    for (let i = 1; i <= lifeRounds.length; i++) {
      steps.push(history({ rounds: lifeRounds.slice(0, i) }))
    }
    steps.push(history({ rounds: lifeRounds, protocolStepReviews: reviews.slice(0, 2) }))
    steps.push(full)
    let ledger = emptyLedger()
    let previous = new Map<string, unknown>()
    for (const step of steps) {
      const events = xpEvents(step)
      for (const next of events) {
        if (previous.has(next.key)) expect(next).toEqual(previous.get(next.key))
        ledger = payEvent(ledger, next)
      }
      previous = new Map(events.map((next) => [next.key, next]))
      // The running total after each step is the recomputed total of that history.
      expect(ledger.xp).toBe(totalXp(events))
    }
    expect(ledger.xp).toBe(totalXp(xpEvents(full)))
  })

  it('gives the same Level and Badges from a recomputed and a replayed history', () => {
    const summary = buildRewardsSummary({ history: full, dayOf: utc, now: NOW })
    // Replaying the same history in another order (the database order is not the time order).
    const shuffled = history({
      rounds: [...lifeRounds].reverse(),
      protocolStepReviews: [...reviews].reverse(),
      designExerciseCompletions: completions
    })
    expect(buildRewardsSummary({ history: shuffled, dayOf: utc, now: NOW })).toEqual(summary)
  })
})
