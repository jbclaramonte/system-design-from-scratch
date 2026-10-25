import { describe, expect, it } from 'vitest'
import { BADGES } from '../../../shared/rewards'
import {
  celebrationAnnouncement,
  celebrationDetail,
  celebrationLabel,
  celebrationTitle
} from './celebrationText'

const perfect = BADGES.find((badge) => badge.id === 'perfect-round')!
const badge = {
  kind: 'badge' as const,
  badge: {
    id: perfect.id,
    title: perfect.title,
    rule: perfect.rule,
    icon: perfect.icon,
    earned: true,
    unlockedAt: '2026-10-24T10:00:00.000Z'
  }
}
const level = (levelNumber: number, previousLevel: number) => ({
  kind: 'level' as const,
  level: { level: levelNumber, name: 'Builder', previousLevel }
})

describe('celebration wording', () => {
  it('names a Badge by its title and says how it was earned', () => {
    expect(celebrationLabel(badge)).toBe('Badge earned')
    expect(celebrationTitle(badge)).toBe('Perfect Round')
    expect(celebrationDetail(badge)).toBe('Score 100% on a completed Round.')
    expect(celebrationAnnouncement(badge)).toBe(
      'Badge earned: Perfect Round. Score 100% on a completed Round.'
    )
  })

  it('names a Level by its number and name', () => {
    expect(celebrationLabel(level(3, 2))).toBe('Level reached')
    expect(celebrationTitle(level(3, 2))).toBe('Level 3: Builder')
    expect(celebrationAnnouncement(level(3, 2))).toBe(
      'Level reached: Level 3: Builder. Keep mastering Topics to climb further.'
    )
  })

  it('says how many Levels were gained at once', () => {
    expect(celebrationDetail(level(4, 2))).toBe('You went up 2 Levels.')
  })

  it('never uses negative wording', () => {
    for (const celebration of [badge, level(2, 1), level(5, 2)]) {
      expect(celebrationAnnouncement(celebration)).not.toMatch(/fail|lost|wrong|miss|behind/i)
    }
  })
})
