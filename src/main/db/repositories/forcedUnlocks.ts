// Forced Unlocks: the Learning Path steps the learner opened without mastering the steps before.
import type { Database } from '../driver'

/** Step keys (`topic:<slug>`, `design_exercise:<slug>`) with a Forced Unlock, oldest first. */
export function listForcedUnlocks(db: Database): string[] {
  return db
    .prepare('SELECT step_key AS stepKey FROM forced_unlocks ORDER BY created_at, step_key')
    .all<{ stepKey: string }>()
    .map((row) => row.stepKey)
}

/** Records the Forced Unlock of a step; keeps the first timestamp when it already exists. */
export function addForcedUnlock(db: Database, stepKey: string): void {
  db.prepare('INSERT OR IGNORE INTO forced_unlocks (step_key) VALUES ($stepKey)').run({ stepKey })
}

/** Removes the Forced Unlock of a step (the step is locked again). */
export function removeForcedUnlock(db: Database, stepKey: string): void {
  db.prepare('DELETE FROM forced_unlocks WHERE step_key = $stepKey').run({ stepKey })
}
