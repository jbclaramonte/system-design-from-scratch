/**
 * What to celebrate: the pure rule behind the Celebrations (#66), shared by the screens and
 * tested on its own. The main process says what unlocked since the last celebration
 * (`PendingCelebrations`); this decides what is worth showing now and in which order.
 * Documented in docs/Rewards Implementation.md.
 */
import type { BadgeStatus, LevelReached, RoundXp } from './rewards'

/** The Round whose screen is open, if any. `passed` is null while it is being played. */
export interface RoundOnScreen {
  passed: boolean | null
  /** What the Round paid, when known. */
  xp?: RoundXp | null
}

export type Celebration =
  /** The XP of a passed Round ticking up under its score. */
  | { kind: 'round_xp'; total: number }
  | { kind: 'badge'; badge: BadgeStatus }
  | { kind: 'level'; level: LevelReached }

export interface CelebrationInput {
  /** The Round on screen; null when no Round is. */
  round: RoundOnScreen | null
  /** Pending Badges, in unlock order. */
  badges: readonly BadgeStatus[]
  level: LevelReached | null
  /** Keys (`celebrationKey`) already shown: a Badge or a Level is never queued twice. */
  shown?: readonly string[]
}

/** Identity of a celebration, for "shown once". The Round XP has none: it plays with its screen. */
export function celebrationKey(celebration: Celebration): string | null {
  switch (celebration.kind) {
    case 'badge':
      return `badge:${celebration.badge.id}`
    case 'level':
      return `level:${celebration.level.level}`
    case 'round_xp':
      return null
  }
}

/**
 * The celebrations to play, in order: the XP of the passed Round, then each new Badge in unlock
 * order, then the new Level. Nothing at all while a Round is being played or when it failed: a
 * failed Round gets the usual feedback only, and what unlocked stays pending until the screen of
 * that Round is closed.
 */
export function whatToCelebrate(input: CelebrationInput): Celebration[] {
  const { round, badges, level, shown = [] } = input
  if (round && round.passed !== true) return []
  const seen = new Set(shown)
  const celebrations: Celebration[] = []
  if (round?.xp && round.xp.total > 0)
    celebrations.push({ kind: 'round_xp', total: round.xp.total })
  for (const badge of badges) {
    if (!badge.earned) continue
    const celebration: Celebration = { kind: 'badge', badge }
    const key = celebrationKey(celebration)!
    if (seen.has(key)) continue
    seen.add(key)
    celebrations.push(celebration)
  }
  if (level) {
    const celebration: Celebration = { kind: 'level', level }
    if (!seen.has(celebrationKey(celebration)!)) celebrations.push(celebration)
  }
  return celebrations
}
