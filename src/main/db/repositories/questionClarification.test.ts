import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../driver'
import { migrate } from '../migrate'
import { migrations } from '../migrations'
import { contentCacheKey, getCachedContent, putCachedContent } from './contentCache'
import { createLesson, createTopic } from './learningContent'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => db.close())

describe('migration 5 (question-clarifications)', () => {
  it('keeps Content Cache entries and the keys that point at them', () => {
    migrate(db, migrations.slice(0, 4))
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const entry = putCachedContent(db, {
      kind: 'lesson',
      inputs: { topic: 'cache' },
      promptVersion: 'lesson-4',
      content: '# Cache',
      grounded: true,
      sourceSections: ['cache']
    })
    const stepLesson = putCachedContent(db, {
      kind: 'protocol_step_lesson',
      inputs: { step: 'api' },
      promptVersion: 'protocol-step-lesson-3',
      content: '## API',
      grounded: true
    })
    const lesson = createLesson(db, {
      topicId: topic.id,
      content: '# Cache',
      grounded: true,
      sourceSections: ['cache'],
      contentCacheKey: entry.cacheKey
    })

    migrate(db, migrations)

    expect(getCachedContent(db, entry.cacheKey)).toMatchObject({
      kind: 'lesson',
      content: '# Cache',
      sourceSections: ['cache'],
      createdAt: entry.createdAt
    })
    expect(getCachedContent(db, stepLesson.cacheKey)).toMatchObject({
      kind: 'protocol_step_lesson'
    })
    const key = () =>
      db
        .prepare('SELECT content_cache_key AS key FROM lessons WHERE id = $id')
        .get<{ key: string | null }>({ id: lesson.id })!.key
    expect(key()).toBe(entry.cacheKey)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    // The foreign key still points at the rebuilt table.
    db.prepare('DELETE FROM content_cache WHERE cache_key = $key').run({ key: entry.cacheKey })
    expect(key()).toBeNull()
  })

  it('accepts the question_clarification kind, and still refuses an unknown one', () => {
    migrate(db, migrations)
    const entry = putCachedContent(db, {
      kind: 'question_clarification',
      inputs: { questionId: 12 },
      promptVersion: 'question-clarification-1',
      content: { rewording: 'Autrement dit...', example: 'Par exemple...' },
      grounded: false
    })

    expect(entry.cacheKey).toBe(
      contentCacheKey('question_clarification', { questionId: 12 }, 'question-clarification-1')
    )
    expect(getCachedContent(db, entry.cacheKey)?.content).toEqual({
      rewording: 'Autrement dit...',
      example: 'Par exemple...'
    })
    expect(() =>
      db.exec(
        `INSERT INTO content_cache (cache_key, kind, inputs, prompt_version, content, grounded)
         VALUES ('x', 'lesson_question', '{}', 'v', '{}', 0)`
      )
    ).toThrow(/CHECK/)
  })
})
