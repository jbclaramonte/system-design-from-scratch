import type { Migration } from '../migrate'

// Forced Unlock (#54): one row per Learning Path step opened without mastering what comes before
// it. The key is the step key of the path (`topic:<slug>` or `design_exercise:<slug>`), not a
// foreign key: the path is computed, not stored, so a key that matches no step is simply ignored.
export const forcedUnlocks: Migration = {
  version: 6,
  name: 'forced-unlocks',
  sql: `
CREATE TABLE forced_unlocks (
  step_key TEXT PRIMARY KEY CHECK (length(step_key) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
`
}
