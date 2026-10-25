// Wording of the Celebrations (#66). Pure and tested. Warm and calm: it says what was reached and
// nothing else, never a comparison, never negative.
import type { Celebration } from '../../../shared/celebrations'

type Unlock = Exclude<Celebration, { kind: 'round_xp' }>

/** The small caps label of the card. */
export const celebrationLabel = (celebration: Unlock): string =>
  celebration.kind === 'badge' ? 'Badge earned' : 'Level reached'

/** The title of the card: the Badge title, or "Level 3: Builder". */
export const celebrationTitle = (celebration: Unlock): string =>
  celebration.kind === 'badge'
    ? celebration.badge.title
    : `Level ${celebration.level.level}: ${celebration.level.name}`

/** The line under the title: how the Badge was earned, or the Level climbed. */
export function celebrationDetail(celebration: Unlock): string {
  if (celebration.kind === 'badge') return celebration.badge.rule
  const { level, previousLevel } = celebration.level
  return level - previousLevel > 1
    ? `You went up ${level - previousLevel} Levels.`
    : 'Keep mastering Topics to climb further.'
}

/** What the live region says, once, politely. */
export const celebrationAnnouncement = (celebration: Unlock): string =>
  `${celebrationLabel(celebration)}: ${celebrationTitle(celebration)}. ${celebrationDetail(celebration)}`
