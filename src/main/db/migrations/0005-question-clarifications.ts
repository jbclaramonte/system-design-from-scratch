import type { Migration } from '../migrate'

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
const TIMESTAMPS = `created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}`
const SOURCE_SECTIONS = `source_sections TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(source_sections) AND json_type(source_sections) = 'array')`

// Question Clarification (#53): content_cache accepts the `question_clarification` kind. SQLite
// cannot alter a CHECK, so the table is rebuilt exactly as migration 4 did: dropping content_cache
// sets the `content_cache_key` of lessons, quizzes and remediation lessons to NULL (ON DELETE SET
// NULL), so the keys are saved first and restored once the new table has the old name. No other
// table changes: a clarification is only a Content Cache entry.
export const questionClarifications: Migration = {
  version: 5,
  name: 'question-clarifications',
  sql: `
CREATE TEMP TABLE saved_content_cache_keys (
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  content_cache_key TEXT NOT NULL
);
INSERT INTO saved_content_cache_keys
  SELECT 'lessons', id, content_cache_key FROM lessons WHERE content_cache_key IS NOT NULL
  UNION ALL
  SELECT 'remediation_lessons', id, content_cache_key FROM remediation_lessons
    WHERE content_cache_key IS NOT NULL
  UNION ALL
  SELECT 'quizzes', id, content_cache_key FROM quizzes WHERE content_cache_key IS NOT NULL;

CREATE TABLE content_cache_v5 (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL
    CHECK (kind IN (
      'lesson', 'remediation_lesson', 'quiz', 'protocol_step_lesson', 'question_clarification'
    )),
  inputs TEXT NOT NULL CHECK (json_valid(inputs)),
  prompt_version TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  ${TIMESTAMPS}
) STRICT;
INSERT INTO content_cache_v5
  (cache_key, kind, inputs, prompt_version, content, grounded, source_sections, created_at,
   updated_at)
  SELECT cache_key, kind, inputs, prompt_version, content, grounded, source_sections, created_at,
    updated_at
  FROM content_cache;
DROP TABLE content_cache;
ALTER TABLE content_cache_v5 RENAME TO content_cache;
CREATE INDEX content_cache_kind ON content_cache (kind);

UPDATE lessons SET content_cache_key = (
  SELECT content_cache_key FROM saved_content_cache_keys
  WHERE table_name = 'lessons' AND row_id = lessons.id
) WHERE id IN (SELECT row_id FROM saved_content_cache_keys WHERE table_name = 'lessons');
UPDATE remediation_lessons SET content_cache_key = (
  SELECT content_cache_key FROM saved_content_cache_keys
  WHERE table_name = 'remediation_lessons' AND row_id = remediation_lessons.id
) WHERE id IN (
  SELECT row_id FROM saved_content_cache_keys WHERE table_name = 'remediation_lessons'
);
UPDATE quizzes SET content_cache_key = (
  SELECT content_cache_key FROM saved_content_cache_keys
  WHERE table_name = 'quizzes' AND row_id = quizzes.id
) WHERE id IN (SELECT row_id FROM saved_content_cache_keys WHERE table_name = 'quizzes');
DROP TABLE saved_content_cache_keys;
`
}
