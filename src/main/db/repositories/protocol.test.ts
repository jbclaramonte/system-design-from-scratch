import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../driver'
import { migrate } from '../migrate'
import { migrations } from '../migrations'
import { contentCacheKey, getCachedContent, putCachedContent } from './contentCache'
import {
  addDesignFeedback,
  createDesignExercise,
  createProtocolStepSubmission,
  failPendingProtocolStepSubmissions,
  getDesignExercise,
  listProtocolStepDrafts,
  listProtocolStepEncounters,
  listProtocolStepSubmissions,
  recordProtocolStepEncounter,
  saveProtocolStepDraft,
  settleProtocolStepSubmission
} from './designPractice'
import { createLesson, createTopic } from './learningContent'

let db: Database

afterEach(() => db.close())

describe('migration 4 (interview-protocol)', () => {
  beforeEach(() => {
    db = openDatabase(':memory:')
  })

  it('keeps Content Cache entries and the keys that point at them', () => {
    migrate(db, migrations.slice(0, 3))
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    const entry = putCachedContent(db, {
      kind: 'lesson',
      inputs: { topic: 'cache' },
      promptVersion: 'lesson-1',
      content: '# Cache',
      grounded: true,
      sourceSections: ['cache']
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

  it('accepts the protocol_step_lesson kind', () => {
    migrate(db, migrations)
    const entry = putCachedContent(db, {
      kind: 'protocol_step_lesson',
      inputs: { step: 'api' },
      promptVersion: 'protocol-step-lesson-1',
      content: '## API',
      grounded: true
    })
    expect(entry.cacheKey).toBe(
      contentCacheKey('protocol_step_lesson', { step: 'api' }, 'protocol-step-lesson-1')
    )
    expect(() =>
      db.exec(
        `INSERT INTO content_cache (cache_key, kind, inputs, prompt_version, content, grounded)
         VALUES ('x', 'design_feedback', '{}', 'v', '{}', 0)`
      )
    ).toThrow(/CHECK/)
  })
})

describe('protocol persistence', () => {
  let exerciseId: number

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, migrations)
    exerciseId = createDesignExercise(db, {
      slug: 'pastebin',
      title: 'Pastebin',
      position: 1,
      grounded: true,
      referenceSolutionSection: 'pastebin',
      problemStatement: 'Design Pastebin.'
    }).id
  })

  it('stores the problem statement of an exercise', () => {
    expect(getDesignExercise(db, exerciseId)?.problemStatement).toBe('Design Pastebin.')
  })

  it('numbers submissions per exercise and step and settles them', () => {
    const first = createProtocolStepSubmission(db, {
      designExerciseId: exerciseId,
      protocolStep: 'functional_requirements',
      content: { type: 'text', text: 'v1' }
    })
    const other = createProtocolStepSubmission(db, {
      designExerciseId: exerciseId,
      protocolStep: 'high_level_design',
      content: { type: 'text', text: 'hld' }
    })
    const second = createProtocolStepSubmission(db, {
      designExerciseId: exerciseId,
      protocolStep: 'functional_requirements',
      content: { type: 'text', text: 'v2' }
    })
    expect([first.number, other.number, second.number]).toEqual([1, 1, 2])
    expect(first.status).toBe('pending')

    const feedback = addDesignFeedback(db, {
      designExerciseId: exerciseId,
      kind: 'step_feedback',
      protocolStep: 'functional_requirements',
      content: { submissionId: first.id },
      grounded: true
    })
    expect(
      settleProtocolStepSubmission(db, first.id, {
        status: 'reviewed',
        designFeedbackId: feedback.id
      })
    ).toMatchObject({ status: 'reviewed', designFeedbackId: feedback.id })
    expect(settleProtocolStepSubmission(db, second.id, { status: 'failed' }).status).toBe('failed')
    expect(failPendingProtocolStepSubmissions(db)).toBe(1)
    expect(listProtocolStepSubmissions(db, exerciseId).map((s) => s.status)).toEqual([
      'reviewed',
      'failed',
      'failed'
    ])
  })

  it('refuses a step feedback on a submission that is not reviewed', () => {
    const submission = createProtocolStepSubmission(db, {
      designExerciseId: exerciseId,
      protocolStep: 'api',
      content: { type: 'text', text: 'x' }
    })
    const feedback = addDesignFeedback(db, {
      designExerciseId: exerciseId,
      kind: 'step_feedback',
      protocolStep: 'api',
      content: {},
      grounded: false
    })
    expect(() =>
      settleProtocolStepSubmission(db, submission.id, {
        status: 'failed',
        designFeedbackId: feedback.id
      })
    ).toThrow(/CHECK/)
  })

  it('saves one draft per exercise and step', () => {
    saveProtocolStepDraft(db, {
      designExerciseId: exerciseId,
      protocolStep: 'api',
      text: 'a'
    })
    saveProtocolStepDraft(db, {
      designExerciseId: exerciseId,
      protocolStep: 'api',
      text: 'b'
    })
    expect(listProtocolStepDrafts(db, exerciseId)).toMatchObject([
      { protocolStep: 'api', text: 'b' }
    ])
  })

  it('keeps the first encounter of a step', () => {
    const later = createDesignExercise(db, {
      slug: 'twitter',
      title: 'Twitter',
      position: 2,
      grounded: false
    }).id
    recordProtocolStepEncounter(db, 'api', exerciseId)
    recordProtocolStepEncounter(db, 'api', later)
    expect(listProtocolStepEncounters(db)).toMatchObject([
      { protocolStep: 'api', designExerciseId: exerciseId }
    ])
  })
})
