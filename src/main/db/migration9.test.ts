// Migration 9 (language-chosen-marker): an install that predates the first-run language question
// never sees it, a fresh or never-used data folder does.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from './driver'
import { migrate } from './migrate'
import { migrations } from './migrations'
import { createQuiz, createRound } from './repositories/assessment'
import { createTopic } from './repositories/learningContent'
import { declareMastery } from './repositories/mastery'
import { getSettings, isGenerationLanguageChosen, updateSettings } from './repositories/settings'
import { saveDismissedUpdateVersion } from './repositories/updateState'
import { insertLegacyCacheEntry } from './testing/legacyRows'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations.slice(0, 8))
})

afterEach(() => db.close())

const migrateToLatest = () => migrate(db, migrations)

describe('migration 9 (language-chosen-marker)', () => {
  it('leaves a fresh data folder without the marker, so the first-run screen shows', () => {
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(false)
    expect(getSettings(db).generationLanguage).toBe('fr')
  })

  it('leaves a folder that only ran the app without marker', () => {
    createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    saveDismissedUpdateVersion(db, '9.9.9')
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(false)
  })

  it('sets the marker on an install that holds generated content', () => {
    insertLegacyCacheEntry(db, {
      kind: 'lesson',
      inputs: { topic: 'cache' },
      promptVersion: 'lesson-4',
      content: '# Cache'
    })
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(true)
    expect(getSettings(db).generationLanguage).toBe('fr')
  })

  it('sets the marker on an install with a round', () => {
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const quiz = createQuiz(db, {
      topicId: topic.id,
      language: 'fr',
      grounded: true,
      questions: []
    })
    createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(true)
  })

  it('sets the marker on an install with a Declared Mastery', () => {
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    declareMastery(db, topic.id)
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(true)
  })

  it('sets the marker on an install whose learner saved a setting', () => {
    updateSettings(db, { checkForUpdatesAtLaunch: false })
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(true)
  })

  it('sets the marker when a seeded setting was changed', () => {
    db.prepare(
      "UPDATE settings SET value = '2', updated_at = '2099-01-01T00:00:00.000Z' WHERE key = 'round_limit'"
    ).run()
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(true)
  })

  it('is applied once: a later launch does not move the marker', () => {
    migrateToLatest()
    createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    declareMastery(db, 1)
    migrateToLatest()
    expect(isGenerationLanguageChosen(db)).toBe(false)
  })
})
