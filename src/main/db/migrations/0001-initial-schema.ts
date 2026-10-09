import type { Migration } from '../migrate'

// Timestamps are ISO 8601 UTC strings with milliseconds, like Date.prototype.toISOString().
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
const TIMESTAMPS = `created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}`
const SOURCE_SECTIONS = `source_sections TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(source_sections) AND json_type(source_sections) = 'array')`

export const initialSchema: Migration = {
  version: 1,
  name: 'initial-schema',
  sql: `
CREATE TABLE content_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('lesson', 'remediation_lesson', 'quiz')),
  inputs TEXT NOT NULL CHECK (json_valid(inputs)),
  prompt_version TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX content_cache_kind ON content_cache (kind);

CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  in_foundations_module INTEGER NOT NULL DEFAULT 0 CHECK (in_foundations_module IN (0, 1)),
  source_section TEXT,
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX topics_position ON topics (position);

CREATE TABLE notions (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  ${TIMESTAMPS},
  UNIQUE (topic_id, slug)
) STRICT;

CREATE TABLE lessons (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  content_cache_key TEXT REFERENCES content_cache (cache_key) ON DELETE SET NULL,
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX lessons_topic ON lessons (topic_id);

CREATE TABLE quizzes (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  content_cache_key TEXT REFERENCES content_cache (cache_key) ON DELETE SET NULL,
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX quizzes_topic ON quizzes (topic_id);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL
    CHECK (type IN ('single_choice', 'multiple_choice', 'scenario', 'free_answer')),
  prompt TEXT NOT NULL,
  body TEXT NOT NULL CHECK (json_valid(body)),
  ${TIMESTAMPS},
  UNIQUE (quiz_id, position)
) STRICT;

CREATE TABLE question_notions (
  question_id INTEGER NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
  notion_id INTEGER NOT NULL REFERENCES notions (id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, notion_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX question_notions_notion ON question_notions (notion_id);

CREATE TABLE rounds (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  quiz_id INTEGER NOT NULL REFERENCES quizzes (id),
  number INTEGER NOT NULL CHECK (number >= 1),
  started_at TEXT NOT NULL DEFAULT ${NOW},
  completed_at TEXT,
  score_percent REAL CHECK (score_percent BETWEEN 0 AND 100),
  passed INTEGER CHECK (passed IN (0, 1)),
  ${TIMESTAMPS},
  CHECK ((completed_at IS NULL) = (score_percent IS NULL)),
  CHECK ((completed_at IS NULL) = (passed IS NULL))
) STRICT;
CREATE UNIQUE INDEX rounds_topic ON rounds (topic_id, number);
CREATE INDEX rounds_quiz ON rounds (quiz_id);

CREATE TABLE remediation_lessons (
  id INTEGER PRIMARY KEY,
  notion_id INTEGER NOT NULL REFERENCES notions (id) ON DELETE CASCADE,
  round_id INTEGER REFERENCES rounds (id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${SOURCE_SECTIONS},
  content_cache_key TEXT REFERENCES content_cache (cache_key) ON DELETE SET NULL,
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX remediation_lessons_notion ON remediation_lessons (notion_id);
CREATE INDEX remediation_lessons_round ON remediation_lessons (round_id);

-- Attempts are history: deleting a question or round that has attempts is refused.
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions (id),
  round_id INTEGER REFERENCES rounds (id),
  question_type TEXT NOT NULL
    CHECK (question_type IN ('single_choice', 'multiple_choice', 'scenario', 'free_answer')),
  answer TEXT NOT NULL CHECK (json_valid(answer)),
  result TEXT NOT NULL CHECK (result IN ('correct', 'partially_correct', 'incorrect')),
  score REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  feedback TEXT,
  attempted_at TEXT NOT NULL DEFAULT ${NOW},
  ${TIMESTAMPS}
) STRICT;
CREATE INDEX attempts_question ON attempts (question_id, attempted_at);
CREATE INDEX attempts_round ON attempts (round_id);
CREATE INDEX attempts_attempted_at ON attempts (attempted_at);

-- Notions of the question at the time of the attempt, so per-notion history survives retagging.
CREATE TABLE attempt_notions (
  attempt_id INTEGER NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  notion_id INTEGER NOT NULL REFERENCES notions (id),
  PRIMARY KEY (attempt_id, notion_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX attempt_notions_notion ON attempt_notions (notion_id, attempt_id);

CREATE TABLE design_exercises (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  reference_solution_section TEXT,
  ${TIMESTAMPS},
  CHECK (grounded = 0 OR reference_solution_section IS NOT NULL)
) STRICT;
CREATE INDEX design_exercises_position ON design_exercises (position);

-- One tldraw snapshot per design exercise, overwritten on save.
CREATE TABLE design_scenes (
  id INTEGER PRIMARY KEY,
  design_exercise_id INTEGER NOT NULL UNIQUE
    REFERENCES design_exercises (id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  ${TIMESTAMPS}
) STRICT;

CREATE TABLE design_feedback (
  id INTEGER PRIMARY KEY,
  design_exercise_id INTEGER NOT NULL REFERENCES design_exercises (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('step_feedback', 'hint', 'final_review')),
  protocol_step TEXT CHECK (protocol_step IN (
    'functional_requirements', 'estimations', 'api', 'data_model', 'high_level_design',
    'non_functional_requirements', 'deep_dive'
  )),
  content TEXT NOT NULL CHECK (json_valid(content)),
  grounded INTEGER NOT NULL CHECK (grounded IN (0, 1)),
  ${TIMESTAMPS},
  CHECK ((kind = 'final_review') = (protocol_step IS NULL))
) STRICT;
CREATE INDEX design_feedback_exercise ON design_feedback (design_exercise_id, protocol_step);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  ${TIMESTAMPS}
) STRICT;
INSERT INTO settings (key, value) VALUES ('mastery_threshold', '100'), ('round_limit', '3');
`
}
