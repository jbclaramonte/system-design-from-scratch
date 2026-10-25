// Badges the learner unlocked, whether their celebration (#66) already played, and the Level
// celebrated so far. The Badge itself is derived from the history; these rows only remember it.
//
// Baseline: the first time the rewards are read, whatever is already earned is recorded as
// celebrated and the current Level is remembered as celebrated, so an existing history never
// replays its past (docs/Rewards Implementation.md). Only what unlocks afterwards celebrates.
import type { Database } from '../driver'
import { fromFlag, NOW } from './mapping'

export interface BadgeUnlockRow {
  badgeId: string
  /** ISO 8601 time of the event that unlocked the Badge. */
  unlockedAt: string
  celebrated: boolean
}

/**
 * Key of the "rewards baseline" marker in the key/value settings table (not part of the Settings
 * screen). Its value is the JSON number of the Level celebrated so far; its absence means the
 * baseline was not taken yet.
 */
const CELEBRATED_LEVEL_KEY = 'celebrated_level'

/** Records the Badges that are earned and not remembered yet (uncelebrated); never changes a known one. */
export function recordBadgeUnlocks(
  db: Database,
  unlocks: readonly { badgeId: string; unlockedAt: string }[]
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO celebrated_badges (badge_id, unlocked_at)
     VALUES ($badgeId, $unlockedAt)`
  )
  db.transaction(() => {
    for (const unlock of unlocks) insert.run({ ...unlock })
  })
}

export function listBadgeUnlocks(db: Database): BadgeUnlockRow[] {
  return db
    .prepare(
      `SELECT badge_id AS badgeId, unlocked_at AS unlockedAt, celebrated
       FROM celebrated_badges ORDER BY unlocked_at, badge_id`
    )
    .all<{ badgeId: string; unlockedAt: string; celebrated: number }>()
    .map((row) => ({ ...row, celebrated: fromFlag(row.celebrated) }))
}

/** Marks a Badge as celebrated; false when it is unknown or was already celebrated. */
export function markBadgeCelebrated(db: Database, badgeId: string): boolean {
  return (
    db
      .prepare(
        `UPDATE celebrated_badges SET celebrated = 1, updated_at = ${NOW}
         WHERE badge_id = $badgeId AND celebrated = 0`
      )
      .run({ badgeId }).changes > 0
  )
}

/** The Level celebrated so far; null while the baseline was not taken. */
export function getCelebratedLevel(db: Database): number | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = $key')
    .get<{ value: string }>({ key: CELEBRATED_LEVEL_KEY })
  return row ? (JSON.parse(row.value) as number) : null
}

/**
 * Takes the baseline once: the Badges earned now are recorded as already celebrated (so are the
 * rows an earlier version left uncelebrated), and `level` is remembered as celebrated, all in one
 * transaction. Returns false and changes nothing when the baseline was taken before.
 */
export function takeRewardsBaseline(
  db: Database,
  baseline: { level: number; earned: readonly { badgeId: string; unlockedAt: string }[] }
): boolean {
  return db.transaction(() => {
    if (getCelebratedLevel(db) !== null) return false
    const insert = db.prepare(
      `INSERT OR IGNORE INTO celebrated_badges (badge_id, unlocked_at, celebrated)
       VALUES ($badgeId, $unlockedAt, 1)`
    )
    for (const unlock of baseline.earned) insert.run({ ...unlock })
    db.prepare(
      `UPDATE celebrated_badges SET celebrated = 1, updated_at = ${NOW} WHERE celebrated = 0`
    ).run()
    db.prepare('INSERT INTO settings (key, value) VALUES ($key, $value)').run({
      key: CELEBRATED_LEVEL_KEY,
      value: JSON.stringify(baseline.level)
    })
    return true
  })
}

/** Remembers a celebrated Level; only ever raises it. */
export function raiseCelebratedLevel(db: Database, level: number): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ($key, $value)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}
     WHERE CAST(excluded.value AS INTEGER) > CAST(settings.value AS INTEGER)`
  ).run({ key: CELEBRATED_LEVEL_KEY, value: JSON.stringify(level) })
}
