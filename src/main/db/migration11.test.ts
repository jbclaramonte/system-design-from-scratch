// Migration 11 (recall-sessions): quizzes get a purpose, Recall sessions and their questions get
// tables, attempts may belong to a Recall session. Every existing row stays a Round row.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { supportedSchemaVersion } from './compatibility'
import { openDatabase, type Database } from './driver'
import { migrate, schemaVersion } from './migrate'
import { migrations } from './migrations'
import { createQuiz, getQuiz, listQuizzesByTopic, recordAttempt } from './repositories/assessment'
import { createTopic } from './repositories/learningContent'
import { createRecallSession } from './repositories/recall'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => db.close())

const BEFORE = migrations.filter((migration) => migration.version <= 10)

/** Rows written by the app before migration 11, with the columns that existed then. */
function seedBefore() {
  db.exec(`
    INSERT INTO topics (id, slug, title, position) VALUES (1, 'cache', 'Cache', 1);
    INSERT INTO notions (id, topic_id, slug, title) VALUES (1, 1, 'cache-aside', 'Cache-aside');
    INSERT INTO quizzes (id, topic_id, grounded) VALUES (1, 1, 0);
    INSERT INTO questions (id, quiz_id, position, type, prompt, body)
      VALUES (1, 1, 0, 'single_choice', 'Why?', '{}');
    INSERT INTO question_notions (question_id, notion_id) VALUES (1, 1);
    INSERT INTO rounds (id, topic_id, quiz_id, number) VALUES (1, 1, 1, 1);
    INSERT INTO attempts (id, question_id, round_id, question_type, answer, result, score)
      VALUES (1, 1, 1, 'single_choice', '{}', 'correct', 1);
  `)
}

describe('migration 11 (recall-sessions)', () => {
  it('keeps old quizzes as Round quizzes and old attempts outside any Recall session', () => {
    migrate(db, BEFORE)
    seedBefore()
    expect(schemaVersion(db)).toBe(10)

    migrate(db, migrations)

    expect(schemaVersion(db)).toBe(supportedSchemaVersion(migrations))
    expect(db.prepare('SELECT purpose FROM quizzes WHERE id = 1').get()).toEqual({
      purpose: 'round'
    })
    expect(db.prepare('SELECT recall_session_id AS id FROM attempts WHERE id = 1').get()).toEqual({
      id: null
    })
    expect(getQuiz(db, 1)?.purpose).toBe('round')
    expect(listQuizzesByTopic(db, 1).map((quiz) => quiz.id)).toEqual([1])
  })

  it('refuses a purpose other than round or recall, and a kind other than gate or practice', () => {
    migrate(db, migrations)
    createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    expect(() =>
      db.prepare("INSERT INTO quizzes (topic_id, grounded, purpose) VALUES (1, 0, 'review')").run()
    ).toThrow()
    expect(() => db.prepare("INSERT INTO recall_sessions (kind) VALUES ('review')").run()).toThrow()
  })

  it('refuses a session question at a position already taken, or twice', () => {
    migrate(db, migrations)
    seedBefore()
    db.exec(`INSERT INTO questions (id, quiz_id, position, type, prompt, body)
      VALUES (2, 1, 1, 'single_choice', 'And?', '{}')`)
    const session = createRecallSession(db, { kind: 'practice', topicId: null, questionIds: [1] })
    const add = db.prepare(
      `INSERT INTO recall_session_questions (session_id, question_id, position)
       VALUES ($sessionId, $questionId, $position)`
    )
    expect(() => add.run({ sessionId: session.id, questionId: 2, position: 0 })).toThrow()
    expect(() => add.run({ sessionId: session.id, questionId: 1, position: 1 })).toThrow()
    expect(add.run({ sessionId: session.id, questionId: 2, position: 1 }).changes).toBe(1)
  })

  it('refuses an attempt on a Recall session that does not exist', () => {
    migrate(db, migrations)
    seedBefore()
    expect(() =>
      recordAttempt(db, {
        questionId: 1,
        recallSessionId: 99,
        answer: {},
        result: 'correct',
        score: 1
      })
    ).toThrow()
  })

  it('stores a quiz purpose', () => {
    migrate(db, migrations)
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const quiz = createQuiz(db, {
      topicId: topic.id,
      purpose: 'recall',
      grounded: false,
      questions: []
    })
    expect(quiz.purpose).toBe('recall')
    expect(createQuiz(db, { topicId: topic.id, grounded: false, questions: [] }).purpose).toBe(
      'round'
    )
  })
})
