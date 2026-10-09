import type { Migration } from '../migrate'

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
const TIMESTAMPS = `created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}`
const SOURCE_SECTIONS = `source_sections TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(source_sections) AND json_type(source_sections) = 'array')`
const PROTOCOL_STEP_CHECK = `CHECK (protocol_step IN (
    'functional_requirements', 'non_functional_requirements', 'estimations', 'api',
    'data_model', 'high_level_design', 'deep_dive'
  ))`

// Interview Protocol (#14).
// - content_cache accepts the `protocol_step_lesson` kind. SQLite cannot alter a CHECK, so the
//   table is rebuilt. The migration runs in a transaction with foreign keys on, where dropping
//   content_cache sets the `content_cache_key` of lessons, quizzes and remediation lessons to
//   NULL (ON DELETE SET NULL): the keys are saved first and restored once the new table has the
//   old name.
// - design_exercises.problem_statement: what the learner is asked to design.
// - protocol_step_submissions: every submission of a step, with its status and step feedback.
// - protocol_step_drafts: the editor text (text steps) or notes (canvas steps) being written.
// - protocol_step_encounters: Protocol Step Lessons the learner has read (once per step, ever).
// Hints, step feedback and final reviews stay in design_feedback.
export const interviewProtocol: Migration = {
  version: 4,
  name: 'interview-protocol',
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

CREATE TABLE content_cache_v4 (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL
    CHECK (kind IN ('lesson', 'remediation_lesson', 'quiz', 'protocol_step_lesson')),
  inputs TEXT NOT NULL CHECK (json_valid(inputs)),
  prompt_version TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  ${TIMESTAMPS}
) STRICT;
INSERT INTO content_cache_v4
  (cache_key, kind, inputs, prompt_version, content, grounded, source_sections, created_at,
   updated_at)
  SELECT cache_key, kind, inputs, prompt_version, content, grounded, source_sections, created_at,
    updated_at
  FROM content_cache;
DROP TABLE content_cache;
ALTER TABLE content_cache_v4 RENAME TO content_cache;
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

ALTER TABLE design_exercises ADD COLUMN problem_statement TEXT;

CREATE TABLE protocol_step_submissions (
  id INTEGER PRIMARY KEY,
  design_exercise_id INTEGER NOT NULL REFERENCES design_exercises (id) ON DELETE CASCADE,
  protocol_step TEXT NOT NULL ${PROTOCOL_STEP_CHECK},
  number INTEGER NOT NULL CHECK (number >= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'failed')),
  content TEXT NOT NULL CHECK (json_valid(content)),
  design_feedback_id INTEGER UNIQUE REFERENCES design_feedback (id) ON DELETE SET NULL,
  ${TIMESTAMPS},
  UNIQUE (design_exercise_id, protocol_step, number),
  CHECK (status = 'reviewed' OR design_feedback_id IS NULL)
) STRICT;

CREATE TABLE protocol_step_drafts (
  design_exercise_id INTEGER NOT NULL REFERENCES design_exercises (id) ON DELETE CASCADE,
  protocol_step TEXT NOT NULL ${PROTOCOL_STEP_CHECK},
  text TEXT NOT NULL,
  ${TIMESTAMPS},
  PRIMARY KEY (design_exercise_id, protocol_step)
) STRICT, WITHOUT ROWID;

CREATE TABLE protocol_step_encounters (
  protocol_step TEXT PRIMARY KEY ${PROTOCOL_STEP_CHECK},
  design_exercise_id INTEGER REFERENCES design_exercises (id) ON DELETE SET NULL,
  ${TIMESTAMPS}
) STRICT;
`
}
