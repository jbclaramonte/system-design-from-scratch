import type { Migration } from '../migrate'

const LANGUAGE = `language TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en'))`

// Generation Language (#57): the course can be generated in French or English. The Content Cache
// and the rows that record what the learner read (lessons, quizzes, remediation lessons) get a
// `language` column. Every existing row is French (the only language until now), which the column
// default backfills; SQLite applies it to the rows already there, so no table is rebuilt and no
// content_cache_key reference is touched.
//
// None of these tables had a uniqueness rule that a second language would break: a topic can
// already have several lessons and quizzes (rows are appended, one per Content Cache entry, the
// latest is read), and remediation lessons are appended per round and notion. Code that decides
// "is it already recorded" now compares the Content Cache key, which differs per language, or the
// language itself. The Content Cache primary key (the cache key) is language-specific by
// construction (`contentCacheKey`), so a French and an English entry coexist.
//
// The `generation_language` setting is seeded with French: existing installs behave as before.
export const generationLanguage: Migration = {
  version: 8,
  name: 'generation-language',
  sql: `
ALTER TABLE content_cache ADD COLUMN ${LANGUAGE};
ALTER TABLE lessons ADD COLUMN ${LANGUAGE};
ALTER TABLE quizzes ADD COLUMN ${LANGUAGE};
ALTER TABLE remediation_lessons ADD COLUMN ${LANGUAGE};

CREATE INDEX lessons_topic_language ON lessons (topic_id, language);
CREATE INDEX quizzes_topic_language ON quizzes (topic_id, language);
CREATE INDEX remediation_lessons_notion_language ON remediation_lessons (notion_id, language);

INSERT INTO settings (key, value) VALUES ('generation_language', '"fr"');
`
}
