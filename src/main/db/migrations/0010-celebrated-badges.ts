import type { Migration } from '../migrate'

// Celebrated badges (#65): which Badges the learner has unlocked and whether their celebration
// (#66) already played, so it plays once. A Badge is derived from the history (rounds, attempts,
// masteries, protocol steps): this table only remembers it. `badge_id` is the id of
// `BADGES` (src/shared/rewards.ts), not a foreign key: the list is code, not data.
export const celebratedBadges: Migration = {
  version: 10,
  name: 'celebrated-badges',
  sql: `
CREATE TABLE celebrated_badges (
  badge_id TEXT PRIMARY KEY CHECK (length(badge_id) > 0),
  unlocked_at TEXT NOT NULL,
  celebrated INTEGER NOT NULL DEFAULT 0 CHECK (celebrated IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
`
}
