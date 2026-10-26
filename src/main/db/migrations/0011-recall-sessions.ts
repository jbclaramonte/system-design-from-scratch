import type { Migration } from '../migrate'

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

// Recall Quiz data (#71). A quiz gets a purpose: every existing quiz is a Round quiz (the column
// default backfills them), a recall quiz holds the questions generated for Recall Quizzes and is
// never played as a Round. A Recall session is one taking of a Recall Quiz: `gate` before a Lesson
// (`topic_id` is the Topic being opened), `practice` from Memory Review (no Topic). Its questions
// are stored with their order so an interrupted session resumes as it was. An Attempt of a Recall
// session has `recall_session_id` and no `round_id`: everything Round-based reads attempts through
// rounds, so Recall Attempts never reach mastery, the Dashboard or the rewards.
export const recallSessions: Migration = {
  version: 11,
  name: 'recall-sessions',
  sql: `
ALTER TABLE quizzes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'round'
  CHECK (purpose IN ('round', 'recall'));

CREATE TABLE recall_sessions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gate', 'practice')),
  topic_id INTEGER REFERENCES topics (id),
  started_at TEXT NOT NULL DEFAULT ${NOW},
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
) STRICT;
CREATE INDEX recall_sessions_topic ON recall_sessions (topic_id, kind);

CREATE TABLE recall_session_questions (
  session_id INTEGER NOT NULL REFERENCES recall_sessions (id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions (id),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (session_id, question_id),
  UNIQUE (session_id, position)
) STRICT;

ALTER TABLE attempts ADD COLUMN recall_session_id INTEGER REFERENCES recall_sessions (id);
CREATE INDEX attempts_recall_session ON attempts (recall_session_id);
`
}
