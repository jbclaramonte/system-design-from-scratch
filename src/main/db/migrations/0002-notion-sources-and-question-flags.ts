import type { Migration } from '../migrate'

// Notions remember the Source Corpus sections they come from (Notion Outline), so remediation
// lessons on one notion are grounded on its own excerpts. Questions can be flagged as faulty and
// replaced: the flagged row is kept (attempts may reference it) and points to its replacement.
export const notionSourcesAndQuestionFlags: Migration = {
  version: 2,
  name: 'notion-sources-and-question-flags',
  sql: `
ALTER TABLE notions ADD COLUMN source_sections TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(source_sections) AND json_type(source_sections) = 'array');

ALTER TABLE questions ADD COLUMN flagged_at TEXT;
ALTER TABLE questions ADD COLUMN flag_reason TEXT
  CHECK (flag_reason IS NULL OR flagged_at IS NOT NULL);
ALTER TABLE questions ADD COLUMN replaced_by_question_id INTEGER REFERENCES questions (id)
  CHECK (replaced_by_question_id IS NULL OR flagged_at IS NOT NULL);
CREATE INDEX questions_replaced_by ON questions (replaced_by_question_id);
`
}
