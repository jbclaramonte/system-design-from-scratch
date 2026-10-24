// Badges the learner unlocked and whether their celebration (#66) already played. The Badge
// itself is derived from the history; these rows only remember it.
import type { Database } from '../driver'
import { fromFlag, NOW } from './mapping'

export interface BadgeUnlockRow {
  badgeId: string
  /** ISO 8601 time of the event that unlocked the Badge. */
  unlockedAt: string
  celebrated: boolean
}

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
