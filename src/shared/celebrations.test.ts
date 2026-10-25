import { describe, expect, it } from 'vitest'
import { celebrationKey, whatToCelebrate } from './celebrations'
import { BADGES, type BadgeStatus, type LevelReached, type RoundXp } from './rewards'

const badge = (id: string, earned = true): BadgeStatus => {
  const definition = BADGES.find((candidate) => candidate.id === id)!
  return {
    id,
    title: definition.title,
    rule: definition.rule,
    icon: definition.icon,
    earned,
    unlockedAt: earned ? '2026-10-24T10:00:00.000Z' : null
  }
}

const level: LevelReached = { level: 2, name: 'Apprentice', previousLevel: 1 }
const xp = (total: number): RoundXp => ({ roundId: 1, total, awards: [] })

describe('whatToCelebrate', () => {
  it('celebrates nothing when nothing unlocked and no Round is open', () => {
    expect(whatToCelebrate({ round: null, badges: [], level: null })).toEqual([])
  })

  it('celebrates the XP of a passed Round', () => {
    expect(
      whatToCelebrate({ round: { passed: true, xp: xp(30) }, badges: [], level: null })
    ).toEqual([{ kind: 'round_xp', total: 30 }])
  })

  it('celebrates no XP when the Round paid nothing or its XP is unknown', () => {
    expect(
      whatToCelebrate({ round: { passed: true, xp: xp(0) }, badges: [], level: null })
    ).toEqual([])
    expect(whatToCelebrate({ round: { passed: true }, badges: [], level: null })).toEqual([])
    expect(whatToCelebrate({ round: { passed: true, xp: null }, badges: [], level: null })).toEqual(
      []
    )
  })

  it('celebrates nothing for a failed Round, whatever is pending', () => {
    expect(
      whatToCelebrate({
        round: { passed: false, xp: xp(12) },
        badges: [badge('perfect-round')],
        level
      })
    ).toEqual([])
  })

  it('celebrates nothing while a Round is being played', () => {
    expect(
      whatToCelebrate({ round: { passed: null }, badges: [badge('comeback')], level })
    ).toEqual([])
  })

  it('celebrates a Badge and a Level outside any Round', () => {
    expect(whatToCelebrate({ round: null, badges: [badge('streak-7')], level })).toEqual([
      { kind: 'badge', badge: badge('streak-7') },
      { kind: 'level', level }
    ])
  })

  it('queues several unlocks in order: the Round XP, each Badge in the order given, the Level', () => {
    const celebrations = whatToCelebrate({
      round: { passed: true, xp: xp(80) },
      badges: [badge('first-topic-mastered'), badge('perfect-round'), badge('comeback')],
      level
    })
    expect(celebrations.map((celebration) => celebration.kind)).toEqual([
      'round_xp',
      'badge',
      'badge',
      'badge',
      'level'
    ])
    expect(
      celebrations.flatMap((celebration) =>
        celebration.kind === 'badge' ? [celebration.badge.id] : []
      )
    ).toEqual(['first-topic-mastered', 'perfect-round', 'comeback'])
  })

  it('plays each unlock once: a shown Badge or Level is not queued again', () => {
    const shown = [celebrationKey({ kind: 'badge', badge: badge('perfect-round') })!]
    const first = whatToCelebrate({
      round: null,
      badges: [badge('perfect-round'), badge('comeback')],
      level,
      shown
    })
    expect(first.map(celebrationKey)).toEqual(['badge:comeback', 'level:2'])
    const second = whatToCelebrate({
      round: null,
      badges: [badge('perfect-round'), badge('comeback')],
      level,
      shown: [...shown, ...first.map((celebration) => celebrationKey(celebration)!)]
    })
    expect(second).toEqual([])
  })

  it('lists a Badge once even when it is given twice', () => {
    expect(
      whatToCelebrate({ round: null, badges: [badge('comeback'), badge('comeback')], level: null })
    ).toHaveLength(1)
  })

  it('skips a Badge that is not earned', () => {
    expect(
      whatToCelebrate({ round: null, badges: [badge('comeback', false)], level: null })
    ).toEqual([])
  })

  it('a later Level is a new celebration', () => {
    const shown = ['level:2']
    expect(
      whatToCelebrate({
        round: null,
        badges: [],
        level: { level: 3, name: 'Builder', previousLevel: 2 },
        shown
      })
    ).toEqual([{ kind: 'level', level: { level: 3, name: 'Builder', previousLevel: 2 } }])
  })
})
