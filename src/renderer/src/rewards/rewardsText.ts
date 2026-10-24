// Labels of the rewards UI (Level, XP, Badges, the XP line of a Round). Pure and tested. Calm
// wording: a locked Badge is "Locked" with its rule, never a reproach, and nothing is red.
import type { BadgeStatus, LevelProgress, RoundXp, XpAward } from '../../../shared/rewards'

export const formatXp = (xp: number): string => `${xp} XP`

/** "Level 3": the number, for the mono figure. */
export const levelLabel = (level: LevelProgress): string => `Level ${level.level}`

/** "30 / 150 XP to Designer", or the top Level. */
export function levelProgressText(level: LevelProgress): string {
  if (level.xpForLevel === null || level.nextName === null) return 'Top Level reached.'
  return `${level.xpIntoLevel} / ${level.xpForLevel} XP to ${level.nextName}`
}

/** The text alternative of the progress bar. */
export function levelValueText(level: LevelProgress): string {
  const base = `${levelLabel(level)}, ${level.name}, ${formatXp(level.xp)}`
  return level.xpToNext === null || level.nextName === null
    ? `${base}, top Level reached`
    : `${base}, ${level.xpToNext} XP to ${level.nextName}`
}

/** "+30 XP: Round passed". */
export const awardLine = (award: XpAward): string => `+${award.xp} XP: ${award.reason}`

/** The lines under a Round's score; empty when it paid nothing. */
export const roundXpLines = (roundXp: RoundXp): string[] => roundXp.awards.map(awardLine)

/** "24 Oct 2026", in the machine's time zone (the moment of the unlocking event). */
export function formatBadgeDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The status written next to the Badge, so it never relies on color. */
export const badgeStatusLabel = (badge: BadgeStatus): string =>
  badge.earned && badge.unlockedAt ? `Earned ${formatBadgeDate(badge.unlockedAt)}` : 'Locked'

/** The whole Badge for a screen reader: "Perfect Round: earned 24 Oct 2026. Score 100%...". */
export function badgeDescription(badge: BadgeStatus): string {
  const status =
    badge.earned && badge.unlockedAt ? `earned ${formatBadgeDate(badge.unlockedAt)}` : 'locked'
  return `${badge.title}: ${status}. ${badge.rule}`
}

export const badgesSummary = (badges: readonly BadgeStatus[]): string =>
  `${badges.filter((badge) => badge.earned).length} of ${badges.length} Badges earned`
