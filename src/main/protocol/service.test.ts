import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DesignExport } from '../../shared/designGraph'
import type { ProtocolStepView } from '../../shared/protocol'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getCachedContent } from '../db/repositories/contentCache'
import {
  createDesignExercise,
  createProtocolStepSubmission,
  listDesignExercises,
  listDesignFeedback,
  listProtocolStepSubmissions
} from '../db/repositories/designPractice'
import { buildCliArgs, buildCliInput } from '../generation/cliRunner'
import { GenerationService } from '../generation/service'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { DESIGN_EXERCISES, seedDesignExercises } from './designExercises'
import {
  DEV_PROTOCOL_PROBLEM_STATEMENT,
  exerciseIndexOf,
  openDevProtocolExercise
} from './exercises'
import { createProtocolService, type ProtocolService } from './service'

const corpus = loadCorpus(corpusPath(join(import.meta.dirname, '../../..')))
/** A 1x1 PNG. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

let db: Database
let fake: FakeCli
let generation: GenerationService
let protocol: ProtocolService

function designExport(designExerciseId: number, label: string, png = true): DesignExport {
  return {
    designExerciseId,
    graph: {
      version: 1,
      nodes: [
        { id: 'shape:client', componentType: 'client', label: 'Client' },
        { id: 'shape:db', componentType: 'database', label }
      ],
      edges: [
        { id: 'shape:a', from: 'shape:client', to: 'shape:db', label: '', direction: 'forward' }
      ],
      annotations: [],
      danglingArrows: [],
      groups: []
    },
    description: `Components (2): Client, ${label}`,
    png: png ? { base64: PNG, width: 1, height: 1 } : null
  }
}

const stepView = (steps: ProtocolStepView[], step: string) => steps.find((s) => s.step === step)!

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  fake = installFakeCli()
  generation = new GenerationService({
    db,
    cli: { env: fake.env },
    resolveCli: async () => fake.bin
  })
  protocol = createProtocolService({ db, corpus, service: generation })
})

afterEach(() => {
  generation.dispose()
  fake.cleanup()
  db.close()
})

describe('exercise index', () => {
  it('ranks Learning Path exercises and lets dev fixtures pick theirs', () => {
    const list = [
      { id: 1, slug: 'dev-scratch' },
      { id: 2, slug: 'pastebin' },
      { id: 5, slug: 'dev-protocol-4' },
      { id: 3, slug: 'twitter' }
    ]
    expect(exerciseIndexOf(list, list[1]!)).toBe(1)
    expect(exerciseIndexOf(list, list[3]!)).toBe(2)
    expect(exerciseIndexOf(list, list[0]!)).toBe(1)
    expect(exerciseIndexOf(list, list[2]!)).toBe(4)
    expect(() => exerciseIndexOf(list, { id: 9, slug: 'mint' })).toThrow()
  })

  it('creates the dev fixture once, grounded on the Pastebin Reference Solution', () => {
    const a = openDevProtocolExercise(db, corpus, 1)
    expect(openDevProtocolExercise(db, corpus, 1).id).toBe(a.id)
    expect(a).toMatchObject({
      slug: 'dev-protocol-1',
      grounded: true,
      referenceSolutionSection: 'pastebin',
      problemStatement: DEV_PROTOCOL_PROBLEM_STATEMENT
    })
    expect(openDevProtocolExercise(db, corpus, 3).id).not.toBe(a.id)
    expect(() => openDevProtocolExercise(db, corpus, 0)).toThrow()
  })
})

describe('exercise view', () => {
  it('shows every step in canonical order, only the unlocked ones active', () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const view = protocol.getExercise(id)
    expect(view.exerciseIndex).toBe(1)
    expect(view.problemStatement).toBe(DEV_PROTOCOL_PROBLEM_STATEMENT)
    expect(view.referenceSolution?.url).toMatch(/solutions\/system_design\/pastebin/)
    expect(view.steps.map((s) => [s.step, s.active, s.isNew])).toEqual([
      ['functional_requirements', true, true],
      ['non_functional_requirements', false, false],
      ['estimations', false, false],
      ['api', false, false],
      ['data_model', false, false],
      ['high_level_design', true, true],
      ['deep_dive', false, false]
    ])
    expect(view.canRequestFinalReview).toBe(false)
    expect(view.finalReview).toBeNull()
  })

  it('falls back on the Reference Solution title without a problem statement', () => {
    const exercise = createDesignExercise(db, {
      slug: 'pastebin',
      title: 'Pastebin',
      position: 1,
      grounded: true,
      referenceSolutionSection: 'pastebin'
    })
    expect(protocol.getExercise(exercise.id).problemStatement).toBe(
      'Design Pastebin.com (or Bit.ly)'
    )
  })

  it('saves drafts and records Protocol Step Lessons read once, across exercises', () => {
    const first = openDevProtocolExercise(db, corpus, 1).id
    const second = openDevProtocolExercise(db, corpus, 2).id
    protocol.saveDraft(first, 'functional_requirements', 'draft text')
    expect(() => protocol.saveDraft(first, 'api', 'x')).toThrow(/not active/)
    const view = protocol.markLessonSeen(first, 'functional_requirements')
    expect(stepView(view.steps, 'functional_requirements')).toMatchObject({
      draft: 'draft text',
      lessonSeen: true
    })
    const next = protocol.getExercise(second)
    expect(stepView(next.steps, 'functional_requirements')).toMatchObject({
      lessonSeen: true,
      isNew: false,
      draft: ''
    })
    expect(stepView(next.steps, 'estimations')).toMatchObject({ lessonSeen: false, isNew: true })
  })

  it('marks submissions left pending by a previous run as failed', () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    createProtocolStepSubmission(db, {
      designExerciseId: id,
      protocolStep: 'functional_requirements',
      content: { type: 'text', text: 'x' }
    })
    createProtocolService({ db, corpus, service: generation })
    expect(listProtocolStepSubmissions(db, id)[0]!.status).toBe('failed')
  })
})

describe('Protocol Step Lesson', () => {
  it('is grounded on existing interview method sections and cached', async () => {
    for (const step of [
      'functional_requirements',
      'non_functional_requirements',
      'estimations',
      'api',
      'data_model',
      'high_level_design',
      'deep_dive'
    ] as const) {
      const { sourceSections } = protocol.prepareStepLesson(step)
      expect(sourceSections.length).toBeGreaterThan(0)
      expect(sourceSections[0]).toMatch(/^how-to-approach-a-system-design-interview-question\//)
    }
    const first = await generation.generate(protocol.prepareStepLesson('api').request).result
    expect(first.fromCache).toBe(false)
    expect(first.grounded).toBe(true)
    expect(getCachedContent(db, first.cacheKey!)?.kind).toBe('protocol_step_lesson')
    const again = await generation.generate(protocol.prepareStepLesson('api').request).result
    expect(again.fromCache).toBe(true)
    expect(fake.calls()).toHaveLength(1)
  })
})

describe('step feedback', () => {
  it('records a text submission with its Design Feedback', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const outcome = await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: '- users paste text scenario:design'
    })
    expect(outcome.status).toBe('done')
    if (outcome.status !== 'done') return
    expect(outcome.value).toMatchObject({ number: 1, status: 'reviewed' })
    expect(outcome.value.feedback?.checklist).toHaveLength(4)
    expect(stepView(outcome.exercise.steps, 'functional_requirements').submissions).toHaveLength(1)
    const [row] = listDesignFeedback(db, id)
    expect(row).toMatchObject({
      kind: 'step_feedback',
      protocolStep: 'functional_requirements',
      grounded: true
    })
    expect(row!.content).toMatchObject({ promptVersion: 'design-step-feedback-4' })
    const [call] = fake.calls()
    expect(call!.images).toBe(0)
    expect(call!.stdin).toContain('Design Pastebin.com (or Bit.ly)')
    expect(call!.stdin).toContain('<learner_submission step="functional_requirements">')
  })

  it('sends the PNG with a canvas step, and earlier steps as context', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'create paste, read paste scenario:design'
    })
    const outcome = await protocol.submitStep(id, 'high_level_design', {
      type: 'canvas',
      designExport: designExport(id, 'Pastes DB scenario:design'),
      notes: 'one database'
    })
    expect(outcome.status).toBe('done')
    const call = fake.calls()[1]!
    expect(call.argv).toEqual(expect.arrayContaining(['--input-format', 'stream-json']))
    expect(call.images).toBe(1)
    expect(call.stdin).toContain('<learner_previous_step step="functional_requirements">')
    expect(call.stdin).toContain('Pastes DB')
    const [submission] = listProtocolStepSubmissions(db, id).filter(
      (s) => s.protocolStep === 'high_level_design'
    )
    expect(submission!.content).toMatchObject({
      type: 'canvas',
      withPng: true,
      notes: 'one database'
    })
  })

  it('records a failed submission when the Generation fails', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const outcome = await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'scenario:bad-model'
    })
    expect(outcome).toMatchObject({ status: 'failed', error: { code: 'bad_model' } })
    expect(listProtocolStepSubmissions(db, id).map((s) => s.status)).toEqual(['failed'])
    expect(listDesignFeedback(db, id)).toEqual([])
  })

  it('reports a cancelled submission as a failed outcome', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const controller = new AbortController()
    const pending = protocol.submitStep(
      id,
      'functional_requirements',
      { type: 'text', text: 'scenario:slow' },
      controller.signal
    )
    controller.abort()
    expect(await pending).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })
  })

  it('refuses inactive steps, wrong input kinds, empty work and foreign exports', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    await expect(protocol.submitStep(id, 'api', { type: 'text', text: 'GET' })).rejects.toThrow(
      /not active in exercise 1/
    )
    await expect(
      protocol.submitStep(id, 'high_level_design', { type: 'text', text: 'boxes' })
    ).rejects.toThrow(/canvas submission/)
    await expect(
      protocol.submitStep(id, 'functional_requirements', { type: 'text', text: '  ' })
    ).rejects.toThrow(/Write something/)
    await expect(
      protocol.submitStep(id, 'high_level_design', {
        type: 'canvas',
        designExport: designExport(id + 100, 'DB'),
        notes: ''
      })
    ).rejects.toThrow(/another design exercise/)
    const empty = designExport(id, 'DB')
    empty.graph = { ...empty.graph, nodes: [], edges: [] }
    await expect(
      protocol.submitStep(id, 'high_level_design', {
        type: 'canvas',
        designExport: empty,
        notes: ''
      })
    ).rejects.toThrow(/at least one component/)
    expect(fake.calls()).toHaveLength(0)
  })
})

describe('Hints', () => {
  it('go from level 1 to 3, each with the earlier ones, then stop', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const current = { type: 'text' as const, text: 'just a start scenario:design' }
    const levels: number[] = []
    for (let i = 0; i < 3; i++) {
      const outcome = await protocol.requestHint(id, 'functional_requirements', current)
      if (outcome.status !== 'done') throw new Error('hint failed')
      levels.push(outcome.value.level)
    }
    expect(levels).toEqual([1, 2, 3])
    const calls = fake.calls()
    expect(calls[0]!.stdin).toMatch(/Level 1, nudge/)
    expect(calls[1]!.stdin).toMatch(/Level 2, direction/)
    expect(calls[2]!.stdin).toMatch(/Level 3, near-solution/)
    expect(calls[2]!.stdin).toContain('Hints already given on this step:\n1. ')
    const step = stepView(protocol.getExercise(id).steps, 'functional_requirements')
    expect(step.hints.map((h) => h.level)).toEqual([1, 2, 3])
    expect(step.nextHintLevel).toBeNull()
    await expect(protocol.requestHint(id, 'functional_requirements', current)).rejects.toThrow(
      /three Hints/
    )
    // Per step: the other step starts at level 1.
    expect(stepView(protocol.getExercise(id).steps, 'high_level_design').nextHintLevel).toBe(1)
  })

  it('do not use up a level when the Generation fails', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    const failed = await protocol.requestHint(id, 'functional_requirements', {
      type: 'text',
      text: 'scenario:crash'
    })
    expect(failed.status).toBe('failed')
    expect(stepView(failed.exercise.steps, 'functional_requirements').nextHintLevel).toBe(1)
  })
})

describe('final review', () => {
  it('needs every active step reviewed, then compares with the Reference Solution', async () => {
    const { id } = openDevProtocolExercise(db, corpus, 1)
    await expect(protocol.requestFinalReview(id)).rejects.toThrow(/every active step/)
    await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'create and read pastes scenario:design'
    })
    const hld = await protocol.submitStep(id, 'high_level_design', {
      type: 'canvas',
      designExport: designExport(id, 'DB', false),
      notes: ''
    })
    expect(hld.status).toBe('done')
    expect(fake.calls()[1]!.images).toBe(0)
    expect(protocol.getExercise(id).canRequestFinalReview).toBe(true)

    const review = await protocol.requestFinalReview(id)
    expect(review.status).toBe('done')
    if (review.status !== 'done') return
    expect(review.value.review.strengths.length).toBeGreaterThan(0)
    expect(review.exercise.finalReview?.id).toBe(review.value.id)
    const call = fake.calls().at(-1)!
    expect(call.stdin).toContain('to compare with')
    expect(call.stdin).toContain('<learner_submission step="high_level_design">')
    expect(listDesignFeedback(db, id).at(-1)).toMatchObject({
      kind: 'final_review',
      protocolStep: null
    })
  })
})

describe('the catalogued Design Exercises', () => {
  const idOf = (slug: string) => {
    seedDesignExercises(db, corpus)
    return listDesignExercises(db).find((e) => e.slug === slug)!.id
  }
  const pastebin = corpus.getReferenceSolution('pastebin')!

  it('shows the curated statement and the active steps of the order index', () => {
    const exercise = protocol.getExercise(idOf('twitter'))
    expect(exercise.exerciseIndex).toBe(2)
    expect(exercise.problemStatement).toBe(DESIGN_EXERCISES[1]!.problemStatement)
    expect(exercise.steps.filter((s) => s.active).map((s) => s.step)).toEqual([
      'functional_requirements',
      'estimations',
      'high_level_design'
    ])
    expect(exercise.referenceSolution?.url).toMatch(/solutions\/system_design\/twitter/)
  })

  it('judges exercise 1 on its two steps only: no numbers in any prompt', async () => {
    const id = idOf('pastebin')
    await protocol.requestHint(id, 'functional_requirements', {
      type: 'text',
      text: 'scenario:design'
    })
    await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'create and read pastes scenario:design'
    })
    await protocol.submitStep(id, 'high_level_design', {
      type: 'canvas',
      designExport: designExport(id, 'DB', false),
      notes: ''
    })
    const review = await protocol.requestFinalReview(id)
    expect(review.status).toBe('done')
    const [hint, fr, hld, final] = fake.calls().map((call) => call.stdin)
    for (const prompt of [hint!, fr!, hld!, final!]) {
      expect(prompt).toContain(DESIGN_EXERCISES[0]!.problemStatement)
      expect(prompt).toContain(
        'Protocol Steps of this exercise: Functional requirements, High-level design.'
      )
      expect(prompt).toContain('#### Out of scope')
      expect(prompt).not.toContain('Calculate usage')
      expect(prompt).not.toContain('10 million paste writes per month')
    }
    // The functional requirements are judged on the use cases only, the design on its parts too.
    expect(fr).not.toContain('## Core components')
    expect(hld).toContain('## Core components')
    expect(final).toContain('## Core components')
    expect(final).not.toContain(pastebin.steps.find((s) => s.id.startsWith('step-4-'))!.markdown)
  })

  it('retries once a step feedback that names reference items the learner did not write', async () => {
    const id = idOf('pastebin')
    const outcome = await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'create and read pastes scenario:design-leak-once'
    })
    expect(outcome.status).toBe('done')
    if (outcome.status !== 'done') return
    const calls = fake.calls()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.stdin).toContain(
      'Your previous feedback named items of the hidden Reference Solution that the learner did not write (expiration, high availability)'
    )
    expect(outcome.value.feedback?.gaps).toEqual([
      'Tu ne précises pas les cas limites de tes cas d’usage.'
    ])
    expect(listDesignFeedback(db, id)[0]!.content).toMatchObject({
      leakCheck: { firstLeaked: ['expiration', 'high availability'], retried: true, remaining: [] }
    })
  })

  it('drops the entries still leaking after the retry, and allows what the learner wrote', async () => {
    const id = idOf('pastebin')
    const outcome = await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'a paste can expire scenario:design-leak-always'
    })
    if (outcome.status !== 'done') throw new Error('feedback failed')
    expect(fake.calls()).toHaveLength(2)
    // "expire" is the learner's own item: kept. Availability is not: its trade-off is dropped.
    expect(outcome.value.feedback?.gaps).toEqual([
      'Tu ne dis pas ce qui se passe quand un lien expire.',
      'Tu ne précises pas le hors périmètre.'
    ])
    expect(outcome.value.feedback?.forgottenTradeOffs).toEqual([])
    expect(listDesignFeedback(db, id)[0]!.content).toMatchObject({
      leakCheck: {
        firstLeaked: ['high availability'],
        retried: true,
        remaining: ['high availability']
      }
    })
  })

  it('does not check steps without curated terms', async () => {
    const id = idOf('pastebin')
    await protocol.submitStep(id, 'high_level_design', {
      type: 'canvas',
      designExport: designExport(id, 'DB scenario:design-leak-always', false),
      notes: ''
    })
    expect(fake.calls()).toHaveLength(1)
    expect(listDesignFeedback(db, id)[0]!.content).not.toHaveProperty('leakCheck')
  })

  it('gives the estimations of exercise 2 the back-of-the-envelope reference', async () => {
    const id = idOf('twitter')
    await protocol.submitStep(id, 'functional_requirements', {
      type: 'text',
      text: 'post, timelines, search scenario:design'
    })
    const outcome = await protocol.submitStep(id, 'estimations', {
      type: 'text',
      text: '100 million users, 10 tweets a day scenario:design'
    })
    expect(outcome.status).toBe('done')
    const prompt = fake.calls()[1]!.stdin
    expect(prompt).toContain('#### Calculate usage')
    expect(prompt).toContain('6,000 tweets per second')
    expect(prompt).toMatch(/they state their own assumptions/)
    expect(prompt).toContain('<learner_previous_step step="functional_requirements">')
    expect(prompt).not.toContain('## Core components')
  })
})

describe('CLI input with images', () => {
  it('switches to a stream-json user message with the image first', () => {
    const options = {
      bin: 'claude',
      prompt: 'Review this.',
      systemPrompt: 'S',
      images: [{ mediaType: 'image/png' as const, base64: PNG }]
    }
    expect(buildCliArgs(options)).toEqual(expect.arrayContaining(['--input-format', 'stream-json']))
    const message = JSON.parse(buildCliInput(options))
    expect(message).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
          { type: 'text', text: 'Review this.' }
        ]
      }
    })
    expect(buildCliArgs({ ...options, images: [] })).not.toContain('--input-format')
    expect(buildCliInput({ prompt: 'plain' })).toBe('plain')
  })
})
