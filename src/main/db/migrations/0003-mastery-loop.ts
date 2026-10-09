import type { Migration } from '../migrate'

// Mastery Loop (#11): the learner's choice when the Round Limit is reached (another angle, or skip
// and come back later), one per failed round. New settings: questions per quiz (null = automatic)
// and the Claude Code CLI path override (null = automatic lookup).
export const masteryLoop: Migration = {
  version: 3,
  name: 'mastery-loop',
  sql: `
CREATE TABLE round_limit_choices (
  round_id INTEGER PRIMARY KEY REFERENCES rounds (id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('another_angle', 'skip')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO settings (key, value) VALUES ('questions_per_quiz', 'null'), ('claude_cli_path', 'null');
`
}
