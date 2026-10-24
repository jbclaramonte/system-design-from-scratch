import type { Migration } from '../migrate'

// Tables whose rows are the learner's own: content read or generated, rounds played, answers
// given, design work. Seeded reference data (topics, notions, design exercises) is not listed: a
// folder that holds only that was never used.
const LEARNER_TABLES = [
  'content_cache',
  'lessons',
  'quizzes',
  'remediation_lessons',
  'rounds',
  'attempts',
  'round_limit_choices',
  'forced_unlocks',
  'declared_masteries',
  'protocol_step_submissions',
  'protocol_step_drafts',
  'protocol_step_encounters',
  'design_scenes',
  'design_feedback'
]

// Rows of the settings table that every folder has from its migrations, or that the app writes on
// its own (App Update memory): they say nothing about the learner having used the app.
const SEEDED_SETTING_KEYS = [
  'mastery_threshold',
  'round_limit',
  'questions_per_quiz',
  'claude_cli_path',
  'generation_language'
].map((key) => `'${key}'`)

// First-run language choice (#61): the Generation Language is asked once, at the first launch.
// "Language chosen" is a marker row in the key/value settings table, distinct from the
// `generation_language` setting (French from migration 8, a valid value before any choice).
//
// An install that predates the question must never see it: its content, if any, is French, and
// its language stays what it is. The marker is backfilled when the data folder already holds any
// content, round, answer or design work, or a setting the learner saved (a setting row that is
// not one of the seeded ones, or a seeded one changed since the migration seeded it). A fresh
// folder, and one that only ever ran the app without doing anything in it, has no marker and
// shows the screen. The marker value is the JSON `true`, like every settings value.
export const languageChosenMarker: Migration = {
  version: 9,
  name: 'language-chosen-marker',
  sql: `
INSERT INTO settings (key, value)
SELECT 'generation_language_chosen', 'true'
WHERE ${LEARNER_TABLES.map((table) => `EXISTS (SELECT 1 FROM ${table})`).join('\n   OR ')}
   OR EXISTS (
     SELECT 1 FROM settings
     WHERE key NOT LIKE 'update\\_%' ESCAPE '\\'
       AND (key NOT IN (${SEEDED_SETTING_KEYS.join(', ')}) OR updated_at <> created_at)
   );
`
}
