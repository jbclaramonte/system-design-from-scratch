// Migration 8 (generation-language): the Generation Language columns, backfilled to French, and
// what the old uniqueness rules allow: a topic can have a lesson, quizzes and remediation lessons
// in each language.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from './driver'
import { migrate } from './migrate'
import { migrations } from './migrations'
import { createQuiz, getQuiz, listQuizzesByTopic } from './repositories/assessment'
import { contentCacheKey, getCachedContent, putCachedContent } from './repositories/contentCache'
import {
  createLesson,
  createNotions,
  createRemediationLesson,
  createTopic,
  listLessonsByTopic,
  listRemediationLessonsByNotion
} from './repositories/learningContent'
import { getGenerationLanguage, getSettings, updateSettings } from './repositories/settings'
import { insertLegacyCacheEntry, insertLegacyLesson } from './testing/legacyRows'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => db.close())

const columnsOf = (table: string) =>
  db.prepare(`PRAGMA table_info(${table})`).all<{ name: string; dflt_value: string | null }>()

describe('migration 8 (generation-language)', () => {
  it('backfills every existing row to French and keeps the French Content Cache keys', () => {
    migrate(db, migrations.slice(0, 7))
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const [notion] = createNotions(db, [{ topicId: topic.id, slug: 'a', title: 'A' }])
    const key = insertLegacyCacheEntry(db, {
      kind: 'lesson',
      inputs: { topic: 'cache' },
      promptVersion: 'lesson-4',
      content: '# Cache'
    })
    insertLegacyLesson(db, { topicId: topic.id, content: '# Cache', contentCacheKey: key })
    db.prepare(
      'INSERT INTO quizzes (topic_id, grounded, content_cache_key) VALUES ($topicId, 1, $key)'
    ).run({ topicId: topic.id, key })
    db.prepare(
      "INSERT INTO remediation_lessons (notion_id, content, grounded) VALUES ($notionId, 'R', 1)"
    ).run({ notionId: notion!.id })

    migrate(db, migrations)

    expect(getCachedContent(db, key)).toMatchObject({ language: 'fr', content: '# Cache' })
    expect(key).toBe(contentCacheKey('lesson', { topic: 'cache' }, 'lesson-4', 'fr'))
    expect(listLessonsByTopic(db, topic.id)).toMatchObject([
      { language: 'fr', contentCacheKey: key }
    ])
    expect(listQuizzesByTopic(db, topic.id)).toMatchObject([{ language: 'fr' }])
    expect(listRemediationLessonsByNotion(db, notion!.id)).toMatchObject([{ language: 'fr' }])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('seeds the setting with French, so an existing install behaves as before', () => {
    migrate(db, migrations.slice(0, 7))
    migrate(db, migrations)
    expect(getSettings(db).generationLanguage).toBe('fr')
    expect(getGenerationLanguage(db)).toBe('fr')
  })

  it('defaults new rows to French in the schema, and refuses an unknown language', () => {
    migrate(db, migrations)
    for (const table of ['content_cache', 'lessons', 'quizzes', 'remediation_lessons']) {
      expect(columnsOf(table).find((c) => c.name === 'language')).toMatchObject({
        dflt_value: "'fr'"
      })
    }
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    expect(() =>
      db
        .prepare(
          "INSERT INTO lessons (topic_id, content, language, grounded) VALUES ($id, 'x', 'de', 1)"
        )
        .run({ id: topic.id })
    ).toThrow(/CHECK/)
  })

  it('lets a topic have a lesson, quizzes and remediation lessons in each language', () => {
    migrate(db, migrations)
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const [notion] = createNotions(db, [{ topicId: topic.id, slug: 'a', title: 'A' }])

    createLesson(db, { topicId: topic.id, content: 'Bonjour', language: 'fr', grounded: true })
    createLesson(db, { topicId: topic.id, content: 'Hello', language: 'en', grounded: true })
    const french = createQuiz(db, {
      topicId: topic.id,
      language: 'fr',
      grounded: true,
      questions: []
    })
    const english = createQuiz(db, {
      topicId: topic.id,
      language: 'en',
      grounded: true,
      questions: []
    })
    createRemediationLesson(db, {
      notionId: notion!.id,
      content: 'Autre',
      language: 'fr',
      grounded: true
    })
    createRemediationLesson(db, {
      notionId: notion!.id,
      content: 'Other',
      language: 'en',
      grounded: true
    })

    expect(listLessonsByTopic(db, topic.id).map((l) => l.language)).toEqual(['en', 'fr'])
    expect(getQuiz(db, french.id)?.language).toBe('fr')
    expect(getQuiz(db, english.id)?.language).toBe('en')
    expect(listRemediationLessonsByNotion(db, notion!.id).map((l) => l.language)).toEqual([
      'en',
      'fr'
    ])
  })

  it('keeps a French and an English Content Cache entry for the same inputs', () => {
    migrate(db, migrations)
    const entry = {
      kind: 'quiz',
      inputs: { topic: 'cache' },
      promptVersion: 'quiz-7',
      grounded: true
    } as const
    putCachedContent(db, { ...entry, language: 'fr', content: { questions: [] } })
    putCachedContent(db, { ...entry, language: 'en', content: { questions: [1] } })
    expect(db.prepare('SELECT COUNT(*) AS n FROM content_cache').get()).toEqual({ n: 2 })
  })

  it('stores the setting and ignores a stored value that is not a language', () => {
    migrate(db, migrations)
    expect(updateSettings(db, { generationLanguage: 'en' }).generationLanguage).toBe('en')
    expect(getGenerationLanguage(db)).toBe('en')
    db.prepare("UPDATE settings SET value = '\"de\"' WHERE key = 'generation_language'").run()
    expect(getGenerationLanguage(db)).toBe('fr')
  })
})
