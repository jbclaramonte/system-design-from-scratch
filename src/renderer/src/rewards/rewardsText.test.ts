import { describe, expect, it } from 'vitest'
import type { BadgeStatus, LevelProgress, RoundXp } from '../../../shared/rewards'
import {
  awardLine,
  badgeDescription,
  badgesSummary,
  badgeStatusLabel,
  formatBadgeDate,
  formatXp,
  levelLabel,
  levelProgressText,
  levelValueText,
  roundXpLines
} from './rewardsText'

const level = (over: Partial<LevelProgress> = {}): LevelProgress => ({
  level: 2,
  name: 'Apprentice',
  xp: 175,
  xpIntoLevel: 75,
  xpForLevel: 150,
  xpToNext: 75,
  nextName: 'Builder',
  percent: 50,
  ...over
})

const badge = (over: Partial<BadgeStatus> = {}): BadgeStatus => ({
  id: 'perfect-round',
  title: 'Perfect Round',
  rule: 'Score 100% on a completed Round.',
  icon: 'target',
  earned: false,
  unlockedAt: null,
  ...over
})

describe('Level text', () => {
  it('names the Level and the progress to the next one', () => {
    expect(formatXp(175)).toBe('175 XP')
    expect(levelLabel(level())).toBe('Level 2')
    expect(levelProgressText(level())).toBe('75 / 150 XP to Builder')
    expect(levelValueText(level())).toBe('Level 2, Apprentice, 175 XP, 75 XP to Builder')
  })

  it('says the top Level is reached, with no next Level', () => {
    const top = level({
      level: 9,
      name: 'Architect',
      xpForLevel: null,
      xpToNext: null,
      nextName: null,
      percent: 100
    })
    expect(levelProgressText(top)).toBe('Top Level reached.')
    expect(levelValueText(top)).toMatch(/top Level reached/)
  })
})

describe('XP lines', () => {
  it('writes "+30 XP: Round passed"', () => {
    expect(awardLine({ xp: 30, kind: 'round_passed', reason: 'Round passed' })).toBe(
      '+30 XP: Round passed'
    )
    const paid: RoundXp = {
      roundId: 1,
      total: 80,
      awards: [
        { xp: 30, kind: 'round_passed', reason: 'Round passed' },
        { xp: 50, kind: 'topic_mastered', reason: 'Topic mastered' }
      ]
    }
    expect(roundXpLines(paid)).toEqual(['+30 XP: Round passed', '+50 XP: Topic mastered'])
    expect(roundXpLines({ roundId: 2, total: 0, awards: [] })).toEqual([])
  })
})

describe('Badge text', () => {
  it('writes the status in words: the date earned, or Locked', () => {
    expect(formatBadgeDate('2026-10-24T12:00:00.000Z')).toMatch(/^2[34] Oct 2026$/)
    expect(formatBadgeDate('nope')).toBe('nope')
    expect(badgeStatusLabel(badge())).toBe('Locked')
    expect(
      badgeStatusLabel(badge({ earned: true, unlockedAt: '2026-10-24T12:00:00.000Z' }))
    ).toMatch(/^Earned 2[34] Oct 2026$/)
  })

  it('gives a screen reader the title, the status and the rule', () => {
    expect(badgeDescription(badge())).toBe(
      'Perfect Round: locked. Score 100% on a completed Round.'
    )
    expect(
      badgeDescription(badge({ earned: true, unlockedAt: '2026-10-24T12:00:00.000Z' }))
    ).toMatch(/^Perfect Round: earned 2[34] Oct 2026\. Score 100%/)
  })

  it('counts the earned Badges', () => {
    expect(badgesSummary([badge(), badge({ earned: true, unlockedAt: 'x' })])).toBe(
      '1 of 2 Badges earned'
    )
    expect(badgesSummary([])).toBe('0 of 0 Badges earned')
  })
})
