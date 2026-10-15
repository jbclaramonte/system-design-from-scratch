import type { Migration } from '../migrate'

// Declared Mastery (#55): the learner declared a topic as already known, without a Round. One row
// per topic. The mastery of the topic is still derived (src/main/mastery/state.ts): the row is one
// more input, never a Round, an Attempt or a score.
export const declaredMasteries: Migration = {
  version: 7,
  name: 'declared-masteries',
  sql: `
CREATE TABLE declared_masteries (
  topic_id INTEGER PRIMARY KEY REFERENCES topics (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
`
}
