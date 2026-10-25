/**
 * XP, Levels and Badges: the rule tables and the types shared by the main process
 * (src/main/rewards) and the screens (src/renderer/src/rewards). Rewards mastery only: no tokens,
 * no currency, no leaderboard. Everything here is data, so changing a rule, a threshold or adding
 * a Badge of an existing kind is an edit of this file. Documented in docs/Rewards Implementation.md.
 */

/** XP per learning event. Nothing else pays: see docs/concepts/XP.md. */
export const XP_RULES = {
  /** A completed Round pays `round(scorePercent / roundScoreDivisor)`: 0 to 20 XP. */
  roundScoreDivisor: 5,
  /** Added to a completed Round that met the Mastery Threshold (stored `passed`). */
  roundPassedBonus: 10,
  /** The first passed Round of a Topic. Once per Topic, whatever happens afterwards. */
  topicMastered: 50,
  /** The first reviewed submission of a Protocol Step, once per Design Exercise and step. */
  protocolStepPassed: 15,
  /** A Design Exercise whose final review is recorded, once per exercise. */
  designExerciseCompleted: 100
} as const

export const xpEventKinds = [
  'round_completed',
  'round_passed',
  'topic_mastered',
  'protocol_step_passed',
  'design_exercise_completed'
] as const
export type XpEventKind = (typeof xpEventKinds)[number]

/** The reason shown next to the XP ("+30 XP: Round passed"). */
export const xpReasons: Record<XpEventKind, string> = {
  round_completed: 'Round completed',
  round_passed: 'Round passed',
  topic_mastered: 'Topic mastered',
  protocol_step_passed: 'Protocol step passed',
  design_exercise_completed: 'Design Exercise completed'
}

export interface LevelDefinition {
  /** 1-based. */
  level: number
  name: string
  /** Total XP needed to reach the level. */
  minXp: number
}

/** Level thresholds, ascending, the first at 0 XP. A Level is a function of total XP. */
export const LEVELS: readonly LevelDefinition[] = [
  { level: 1, name: 'Novice', minXp: 0 },
  { level: 2, name: 'Apprentice', minXp: 100 },
  { level: 3, name: 'Builder', minXp: 250 },
  { level: 4, name: 'Designer', minXp: 500 },
  { level: 5, name: 'Engineer', minXp: 800 },
  { level: 6, name: 'Senior Engineer', minXp: 1200 },
  { level: 7, name: 'Staff Engineer', minXp: 1700 },
  { level: 8, name: 'Principal Engineer', minXp: 2300 },
  { level: 9, name: 'Architect', minXp: 3000 }
]

/**
 * How a Badge unlocks. A new Badge of one of these kinds is a new entry in `BADGES`; a new kind
 * needs a case in `badgeUnlocks` (src/main/rewards/rewards.ts).
 */
export type BadgeCriterion =
  /** `count` Topics mastered by a passed Round (a Declared Mastery does not count). */
  | { kind: 'topics_mastered'; count: number }
  /** Every Topic of the Foundations Module mastered by a passed Round. */
  | { kind: 'foundations_completed' }
  /** A completed Round scored 100%. */
  | { kind: 'perfect_round' }
  /** A passed Round on a Topic after a failed Round on the same Topic. */
  | { kind: 'comeback' }
  /** An Activity Streak that reached `days` days (it stays earned if the streak ends). */
  | { kind: 'activity_streak'; days: number }
  /** `count` Design Exercises completed (final review recorded). */
  | { kind: 'design_exercises_completed'; count: number }

export interface BadgeDefinition {
  /** Stable id, stored in `celebrated_badges`. Never reuse or rename. */
  id: string
  title: string
  /** The unlock rule, shown on the locked Badge. */
  rule: string
  /** Glyph name, drawn by `BadgeIcon` in the renderer. */
  icon: BadgeIconName
  criterion: BadgeCriterion
}

export const badgeIcons = ['seedling', 'layers', 'target', 'rebound', 'flame', 'blueprint'] as const
export type BadgeIconName = (typeof badgeIcons)[number]

/** The Badge list, in the order shown. */
export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'first-topic-mastered',
    title: 'First Topic mastered',
    rule: 'Master your first Topic by passing a Round.',
    icon: 'seedling',
    criterion: { kind: 'topics_mastered', count: 1 }
  },
  {
    id: 'foundations-completed',
    title: 'Foundations complete',
    rule: 'Master every Topic of the Foundations Module by passing Rounds.',
    icon: 'layers',
    criterion: { kind: 'foundations_completed' }
  },
  {
    id: 'perfect-round',
    title: 'Perfect Round',
    rule: 'Score 100% on a completed Round.',
    icon: 'target',
    criterion: { kind: 'perfect_round' }
  },
  {
    id: 'comeback',
    title: 'Comeback',
    rule: 'Pass a Round on a Topic after failing one on the same Topic.',
    icon: 'rebound',
    criterion: { kind: 'comeback' }
  },
  {
    id: 'streak-7',
    title: '7-day Activity Streak',
    rule: 'Reach an Activity Streak of 7 days.',
    icon: 'flame',
    criterion: { kind: 'activity_streak', days: 7 }
  },
  {
    id: 'first-design-exercise',
    title: 'First Design Exercise completed',
    rule: 'Complete a Design Exercise with its final review.',
    icon: 'blueprint',
    criterion: { kind: 'design_exercises_completed', count: 1 }
  }
]

// Read models over IPC

export interface LevelProgress {
  level: number
  name: string
  /** Total XP. */
  xp: number
  /** XP earned inside this Level, and the XP the whole Level spans; null at the top Level. */
  xpIntoLevel: number
  xpForLevel: number | null
  /** XP missing for the next Level, with its name; null at the top Level. */
  xpToNext: number | null
  nextName: string | null
  /** 0 to 100 inside the current Level; 100 at the top Level. */
  percent: number
}

export interface BadgeStatus {
  id: string
  title: string
  rule: string
  icon: BadgeIconName
  earned: boolean
  /** ISO 8601 time of the event that unlocked it; null while locked. */
  unlockedAt: string | null
}

export interface RewardsSummary {
  xp: number
  level: LevelProgress
  /** In `BADGES` order. */
  badges: BadgeStatus[]
}

/** One line of XP, "+30 XP: Round passed". */
export interface XpAward {
  xp: number
  kind: XpEventKind
  reason: string
}

/** What a completed Round paid: the Round itself and, when it was the first pass, the Topic. */
export interface RoundXp {
  roundId: number
  total: number
  awards: XpAward[]
}

export interface RoundXpRequest {
  roundId: number
}

// Celebrations (#66)

/** A Level reached and not celebrated yet. Several Levels gained at once are one celebration. */
export interface LevelReached {
  level: number
  name: string
  /** The Level celebrated before (or the Level at the baseline). */
  previousLevel: number
}

/** What unlocked since the last celebration, in unlock order. Nothing here is a past achievement. */
export interface PendingCelebrations {
  badges: BadgeStatus[]
  level: LevelReached | null
}

/** What was shown: the Badges and the Level to remember as celebrated. */
export interface MarkCelebratedRequest {
  badgeIds: string[]
  level: number | null
}
