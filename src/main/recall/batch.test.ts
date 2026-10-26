import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttemptResult } from '../../shared/quiz'
import type { GenerationLanguage } from '../../shared/generationLanguage'
import { createLessonIpc } from '../content/lessonIpc'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  listQuestions,
  nextRoundNumber,
  recordAttempt
} from '../db/repositories/assessment'
import { createNotions, createTopic, listNotionsByTopic } from '../db/repositories/learningContent'
import { declareMastery } from '../db/repositories/mastery'
import { completeRecallSession, createRecallSession } from '../db/repositories/recall'
import type { Notion, Quiz, Topic } from '../db/types'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import type { QuizContent, QuizQuestion } from '../generation/prompts'
import { GenerationService, type CliRunner } from '../generation/service'
import { cacheOutline, fixtureCorpus } from '../generation/testing/contentFixtures'
import {
  generateRecallBatches,
  planDeclaredBatch,
  planRecallBatch,
  triggerRecallBatches
} from './batch'

const corpus = fixtureCorpus()
const LESSON = '# Le cache\n\n## Cache-aside\n<!-- notion: cache-aside -->\nTexte [source: cache]'
const LANGUAGE: GenerationLanguage = 'fr'

let db: Database
let calls: CliCallOptions[]
let generated: number
let loggedOut: boolean
/** Set to make quiz calls fail while outline calls succeed. */
let failQuiz: boolean
let service: GenerationService

const kindOf = (options: CliCallOptions) =>
  options.systemPrompt.includes('Notion Outline')
    ? 'outline'
    : options.jsonSchema
      ? 'quiz'
      : 'lesson'

const slugsIn = (list: string | undefined) =>
  list ? [...list.matchAll(/`([\w-]+)`/g)].map((match) => match[1]!) : []

/**
 * A valid quiz for the prompt: the requested count, the allowed types in turn, question i tagged
 * with target notion i (round robin), fresh prompts. Correct choices: index 0 (and 1).
 */
function quizFor(prompt: string): QuizContent {
  const count = Number(/exactly (\d+) question/.exec(prompt)![1])
  const types = slugsIn(/Question types allowed: ([^\n]*?)\./.exec(prompt)?.[1])
  const missed = slugsIn(/the notions the learner missed: ([^\n]*?)\./.exec(prompt)?.[1])
  const targets = missed.length ? missed : cacheOutline.notions.map((notion) => notion.slug)
  const choices = (correct: number[], total = 4) =>
    Array.from({ length: total }, (_, i) => ({ text: `Choix ${i}`, correct: correct.includes(i) }))
  const questions = Array.from({ length: count }, (_, i): QuizQuestion => {
    const base = {
      prompt: `Nouvelle question ${++generated} ?`,
      notions: [targets[i % targets.length]!],
      sourceSections: ['cache']
    }
    const type = types[i % types.length]
    if (type === 'free_answer') {
      return { type, ...base, expectedPoints: ['Un point.'], modelAnswer: 'Réponse.' }
    }
    if (type === 'multiple_choice') {
      return { type, ...base, choices: choices([0, 1]), explanation: 'E.' }
    }
    if (type === 'scenario') {
      return { type, ...base, scenario: 'Situation.', choices: choices([0], 3), explanation: 'E.' }
    }
    return { type: 'single_choice', ...base, choices: choices([0]), explanation: 'E.' }
  })
  return { questions }
}

const runner: CliRunner = async (options) => {
  calls.push(options)
  if (loggedOut) throw cliFailure('Not logged in · Please run /login')
  const kind = kindOf(options)
  if (failQuiz && kind === 'quiz') throw cliFailure('Not logged in · Please run /login')
  if (kind === 'lesson') options.onEvent?.({ type: 'text_delta', text: LESSON })
  return {
    isError: false,
    subtype: 'success',
    text: kind === 'lesson' ? LESSON : '',
    structuredOutput:
      kind === 'outline' ? cacheOutline : kind === 'quiz' ? quizFor(options.prompt) : undefined,
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0
  }
}

const callsOf = (kind: ReturnType<typeof kindOf>) => calls.filter((c) => kindOf(c) === kind)

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  calls = []
  generated = 0
  loggedOut = false
  failQuiz = false
  service = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
})

afterEach(() => {
  service.dispose()
  db.close()
  vi.restoreAllMocks()
})

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`

interface Seeded {
  topic: Topic
  notion: (slug: string) => Notion
}

let position = 0

/** A Topic grounded on the fixture's cache section, with the cache Notion Outline unless bare. */
function seedTopic(slug: string, options: { bare?: boolean } = {}): Seeded {
  const topic = createTopic(db, { slug, title: slug, position: ++position, sourceSection: 'cache' })
  const notions = options.bare
    ? []
    : createNotions(
        db,
        cacheOutline.notions.map((notion) => ({ topicId: topic.id, ...notion }))
      )
  return { topic, notion: (notionSlug) => notions.find((n) => n.slug === notionSlug)! }
}

let promptCounter = 0

/** A quiz with one single choice question per answer, tagged with the answer's notion. */
function seedQuiz(
  seeded: Seeded,
  answers: readonly [string, AttemptResult][],
  options: { purpose?: Quiz['purpose']; language?: GenerationLanguage } = {}
) {
  const quiz = createQuiz(db, {
    topicId: seeded.topic.id,
    purpose: options.purpose,
    language: options.language ?? LANGUAGE,
    grounded: false,
    questions: answers.map(([slug], index) => ({
      position: index,
      type: 'single_choice',
      prompt: `${seeded.topic.slug} question ${++promptCounter}`,
      body: {},
      notionIds: [seeded.notion(slug).id]
    }))
  })
  return { quiz, questions: listQuestions(db, quiz.id) }
}

/** A completed Round answering each question once; passed (at `passedAt`) when a date is given. */
function playRound(
  seeded: Seeded,
  answers: readonly [string, AttemptResult][],
  passedAt?: string,
  language?: GenerationLanguage
): string[] {
  const { quiz, questions } = seedQuiz(seeded, answers, { language })
  const topicId = seeded.topic.id
  const round = createRound(db, { topicId, quizId: quiz.id, number: nextRoundNumber(db, topicId) })
  questions.forEach((question, index) =>
    recordAttempt(db, {
      questionId: question.id,
      roundId: round.id,
      answer: {},
      result: answers[index]![1],
      score: answers[index]![1] === 'correct' ? 1 : 0
    })
  )
  completeRound(db, round.id, { scorePercent: 50, passed: passedAt !== undefined })
  db.prepare('UPDATE rounds SET completed_at = $at WHERE id = $id').run({
    id: round.id,
    at: passedAt ?? at(1)
  })
  return questions.map((question) => question.prompt)
}

/** A completed Recall session on a recall quiz, answering each question once. */
function playRecall(seeded: Seeded, answers: readonly [string, AttemptResult][]): string[] {
  const { questions } = seedQuiz(seeded, answers, { purpose: 'recall' })
  const session = createRecallSession(db, {
    kind: 'practice',
    topicId: null,
    questionIds: questions.map((question) => question.id)
  })
  questions.forEach((question, index) =>
    recordAttempt(db, {
      questionId: question.id,
      recallSessionId: session.id,
      answer: {},
      result: answers[index]![1],
      score: 0
    })
  )
  completeRecallSession(db, session.id)
  return questions.map((question) => question.prompt)
}

function declare(seeded: Seeded, day: number): void {
  declareMastery(db, seeded.topic.id)
  db.prepare('UPDATE declared_masteries SET created_at = $at WHERE topic_id = $id').run({
    id: seeded.topic.id,
    at: at(day)
  })
}

const missed = (slug: string, times = 3): [string, AttemptResult][] =>
  Array.from({ length: times }, () => [slug, 'incorrect'])
const right = (slug: string, times = 2): [string, AttemptResult][] =>
  Array.from({ length: times }, () => [slug, 'correct'])
const everyNotionMissed = () => cacheOutline.notions.flatMap((notion) => missed(notion.slug))

const recallQuizzes = () =>
  db
    .prepare(`SELECT id, topic_id AS topicId FROM quizzes WHERE purpose = 'recall' ORDER BY id`)
    .all<{ id: number; topicId: number }>()

const generatedRecallQuizzes = () =>
  recallQuizzes().filter(({ id }) =>
    listQuestions(db, id).every((question) => question.prompt.startsWith('Nouvelle question'))
  )

const tableCounts = () =>
  Object.fromEntries(
    ['quizzes', 'questions', 'question_notions', 'notions', 'content_cache'].map((table) => [
      table,
      db.prepare(`SELECT count(*) AS n FROM ${table}`).get<{ n: number }>()!.n
    ])
  )

/**
 * The usual path: A passed latest (excluded), C being opened (excluded although passed and
 * shaky), B with two notions that need attention and one steadier, D with one steadier notion.
 */
function seedPath() {
  const a = seedTopic('a')
  const b = seedTopic('b')
  const c = seedTopic('c')
  const d = seedTopic('d')
  playRound(a, everyNotionMissed(), at(20))
  playRound(c, everyNotionMissed(), at(8))
  playRound(d, [['client-caching', 'incorrect'], ...right('client-caching', 1)], at(5))
  const bPrompts = playRound(
    b,
    [
      ...missed('write-through'),
      ...missed('cache-consistency'),
      ['client-caching', 'incorrect'],
      ['client-caching', 'correct'],
      ...right('cache-aside')
    ],
    at(10)
  )
  return { a, b, c, d, bPrompts }
}

describe('planRecallBatch', () => {
  it('targets the eligible Topic with the shakiest notions, attention first, at most 3', () => {
    const { b, c } = seedPath()

    const plan = planRecallBatch(db, c.topic.id, LANGUAGE)

    expect(plan).toMatchObject({
      kind: 'shaky',
      topicId: b.topic.id,
      focusNotionIds: [
        b.notion('write-through').id,
        b.notion('cache-consistency').id,
        b.notion('client-caching').id
      ]
    })
  })

  it('avoids every prompt asked on the focus notions, of any quiz, in the Generation Language', () => {
    const { b, c, bPrompts } = seedPath()
    const recallPrompts = playRecall(b, [['write-through', 'incorrect']])
    // Never asked, on a notion left out, or in another language: not avoided.
    seedQuiz(b, [['write-through', 'correct']], { purpose: 'recall' })
    const english = playRound(b, [['cache-consistency', 'incorrect']], undefined, 'en')

    const plan = planRecallBatch(db, c.topic.id, LANGUAGE)!

    expect(plan.avoidPrompts).toEqual([...bPrompts.slice(0, 8), ...recallPrompts])
    expect(plan.avoidPrompts).not.toContain(english[0])
  })

  it('returns null with no eligible Topic, or no shaky notion on the eligible ones', () => {
    const a = seedTopic('a')
    const b = seedTopic('b')
    playRound(a, everyNotionMissed(), at(20))
    expect(planRecallBatch(db, b.topic.id, LANGUAGE)).toBeNull()

    playRound(
      b,
      cacheOutline.notions.flatMap((notion) => right(notion.slug)),
      at(10)
    )
    expect(planRecallBatch(db, seedTopic('c').topic.id, LANGUAGE)).toBeNull()
  })
})

describe('planDeclaredBatch', () => {
  it('picks the earliest declared eligible Topic with no recall quiz and no answered question', () => {
    const latest = seedTopic('latest', { bare: true })
    const recalled = seedTopic('recalled')
    const answered = seedTopic('answered')
    const opening = seedTopic('opening', { bare: true })
    const outlined = seedTopic('outlined')
    const bare = seedTopic('bare', { bare: true })
    declare(latest, 20)
    declare(recalled, 1)
    declare(answered, 2)
    declare(opening, 3)
    declare(outlined, 4)
    declare(bare, 5)
    seedQuiz(recalled, [['cache-aside', 'correct']], { purpose: 'recall' })
    playRound(answered, [['cache-aside', 'correct']])

    // Notions but no question yet (a batch whose question Generation failed): planned again.
    expect(planDeclaredBatch(db, opening.topic.id, LANGUAGE)).toEqual({
      kind: 'declared',
      topicId: outlined.topic.id,
      focusNotionIds: [],
      avoidPrompts: []
    })
  })

  it('plans a declared Topic again in another Generation Language', () => {
    const latest = seedTopic('latest', { bare: true })
    const recalled = seedTopic('recalled')
    declare(latest, 20)
    declare(recalled, 1)
    seedQuiz(recalled, [['cache-aside', 'correct']], { purpose: 'recall', language: 'en' })
    const opening = seedTopic('opening').topic.id

    expect(planDeclaredBatch(db, opening, 'en')).toBeNull()
    expect(planDeclaredBatch(db, opening, 'fr')).toMatchObject({ topicId: recalled.topic.id })
  })

  it('returns null when every declared eligible Topic has a recall quiz or an answer', () => {
    const latest = seedTopic('latest', { bare: true })
    const recalled = seedTopic('recalled')
    const answered = seedTopic('answered')
    declare(latest, 20)
    declare(recalled, 1)
    declare(answered, 2)
    seedQuiz(recalled, [['cache-aside', 'correct']], { purpose: 'recall' })
    playRound(answered, [['cache-aside', 'incorrect']])

    expect(planDeclaredBatch(db, seedTopic('opening').topic.id, LANGUAGE)).toBeNull()
  })
})

describe('generateRecallBatches', () => {
  it('stores one recall quiz of 3 local-grading questions on the shakiest Topic', async () => {
    const { b, c, bPrompts } = seedPath()
    const pregenerate = vi.spyOn(service, 'pregenerate')
    // Every prompt asked on the three focus notions (the first 8 questions of B's Round).
    const avoidPrompts = bPrompts.slice(0, 8)
    expect(planRecallBatch(db, c.topic.id, LANGUAGE)!.avoidPrompts).toEqual(avoidPrompts)

    await generateRecallBatches({ db, corpus, service }, c.topic.id, LANGUAGE)

    expect(callsOf('quiz')).toHaveLength(1)
    expect(generatedRecallQuizzes()).toEqual([expect.objectContaining({ topicId: b.topic.id })])
    const [quiz] = generatedRecallQuizzes()
    const questions = listQuestions(db, quiz!.id)
    expect(questions.map((question) => question.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'scenario'
    ])
    expect(questions.map((question) => question.notionIds)).toEqual([
      [b.notion('write-through').id],
      [b.notion('cache-consistency').id],
      [b.notion('client-caching').id]
    ])
    expect(pregenerate).toHaveBeenCalledTimes(1)
    expect(pregenerate.mock.calls[0]![0].input).toMatchObject({
      topic: 'b',
      targetNotions: ['write-through', 'cache-consistency', 'client-caching'],
      count: 3,
      types: ['single_choice', 'multiple_choice', 'scenario'],
      avoidPrompts,
      lesson: null
    })
  })

  it('leaves the database unchanged and does not throw when the Generation fails', async () => {
    const { c } = seedPath()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    loggedOut = true
    const before = tableCounts()

    await expect(
      generateRecallBatches({ db, corpus, service }, c.topic.id, LANGUAGE)
    ).resolves.toBeUndefined()

    expect(callsOf('quiz')).toHaveLength(1)
    expect(tableCounts()).toEqual(before)
    expect(error).toHaveBeenCalledWith('Recall pre-generation failed', expect.anything())
  })

  it('generates nothing when no Topic is eligible', async () => {
    const a = seedTopic('a')
    playRound(a, everyNotionMissed(), at(20))

    await generateRecallBatches({ db, corpus, service }, seedTopic('c').topic.id, LANGUAGE)

    expect(calls).toEqual([])
    expect(recallQuizzes()).toEqual([])
  })

  it('outlines a declared Topic without notions, then generates its questions', async () => {
    const latest = seedTopic('latest')
    const declared = seedTopic('declared', { bare: true })
    declare(latest, 20)
    declare(declared, 3)

    await generateRecallBatches({ db, corpus, service }, seedTopic('c').topic.id, LANGUAGE)

    expect(calls.map(kindOf)).toEqual(['outline', 'quiz'])
    expect(listNotionsByTopic(db, declared.topic.id).map((notion) => notion.slug)).toEqual(
      cacheOutline.notions.map((notion) => notion.slug)
    )
    expect(generatedRecallQuizzes()).toEqual([
      expect.objectContaining({ topicId: declared.topic.id })
    ])
  })

  it('plans a declared Topic again after its question Generation failed, with its outline', async () => {
    const latest = seedTopic('latest')
    const declared = seedTopic('declared', { bare: true })
    declare(latest, 20)
    declare(declared, 3)
    const deps = { db, corpus, service }
    const opening = seedTopic('c').topic.id
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failQuiz = true
    await generateRecallBatches(deps, opening, LANGUAGE)
    expect(calls.map(kindOf)).toEqual(['outline', 'quiz'])
    expect(listNotionsByTopic(db, declared.topic.id)).toHaveLength(cacheOutline.notions.length)
    expect(recallQuizzes()).toEqual([])

    failQuiz = false
    calls = []
    await generateRecallBatches(deps, opening, LANGUAGE)

    expect(calls.map(kindOf)).toEqual(['quiz'])
    expect(generatedRecallQuizzes()).toEqual([
      expect.objectContaining({ topicId: declared.topic.id })
    ])
  })

  it('starts at most one shaky batch and one declared batch', async () => {
    const { b, c } = seedPath()
    const declared = seedTopic('declared', { bare: true })
    const other = seedTopic('other', { bare: true })
    declare(declared, 2)
    declare(other, 3)

    await generateRecallBatches({ db, corpus, service }, c.topic.id, LANGUAGE)

    expect(callsOf('outline')).toHaveLength(1)
    expect(callsOf('quiz')).toHaveLength(2)
    expect(generatedRecallQuizzes().map((quiz) => quiz.topicId)).toEqual(
      expect.arrayContaining([b.topic.id, declared.topic.id])
    )
    expect(generatedRecallQuizzes()).toHaveLength(2)
    expect(listNotionsByTopic(db, other.topic.id)).toEqual([])
  })

  it('serves a second call with the same data from the Content Cache, without a second quiz', async () => {
    const { c } = seedPath()
    const deps = { db, corpus, service }
    await generateRecallBatches(deps, c.topic.id, LANGUAGE)
    const before = tableCounts()

    await generateRecallBatches(deps, c.topic.id, LANGUAGE)

    expect(callsOf('quiz')).toHaveLength(1)
    expect(tableCounts()).toEqual(before)
  })
})

describe('triggerRecallBatches', () => {
  it('runs in the background and never throws to the caller', async () => {
    const { b, c } = seedPath()

    expect(triggerRecallBatches({ db, corpus, service }, c.topic.id, LANGUAGE)).toBeUndefined()

    await expect
      .poll(() => generatedRecallQuizzes().map((quiz) => quiz.topicId))
      .toEqual([b.topic.id])
  })

  it('is started by the lesson flow once the Lesson is streamed', async () => {
    const { b, c } = seedPath()
    const client = Object.assign(new EventEmitter(), {
      send: () => {},
      isDestroyed: () => false
    }) as unknown as GenerationClient

    createLessonIpc({ db, corpus, service }).start({ requestId: 'r1', topicId: c.topic.id }, client)

    await expect
      .poll(() => generatedRecallQuizzes().map((quiz) => quiz.topicId))
      .toEqual([b.topic.id])
    // The first Round's quiz Pre-generation of the opened Topic, then the recall batch.
    expect(calls.map(kindOf)).toEqual(['lesson', 'quiz', 'quiz'])
  })

  it('starts the recall batches after the first Round quiz request is enqueued', async () => {
    const { c } = seedPath()
    const declared = seedTopic('declared', { bare: true })
    declare(declared, 2)
    const client = Object.assign(new EventEmitter(), {
      send: () => {},
      isDestroyed: () => false
    }) as unknown as GenerationClient

    createLessonIpc({ db, corpus, service }).start({ requestId: 'r1', topicId: c.topic.id }, client)

    await expect.poll(() => generatedRecallQuizzes().length).toBe(2)
    // The declared batch starts with an outline Generation: it must not take the single
    // background slot before the first Round quiz (the one made from the Lesson just read).
    const firstRound = calls.findIndex(
      (call) => kindOf(call) === 'quiz' && call.prompt.includes('Texte [source: cache]')
    )
    const outline = calls.findIndex((call) => kindOf(call) === 'outline')
    expect(calls.map(kindOf)[0]).toBe('lesson')
    expect(firstRound).toBe(1)
    expect(outline).toBeGreaterThan(firstRound)
    expect(callsOf('outline')).toHaveLength(1)
  })

  it('still starts the recall batches when the first Round quiz cannot be prepared', async () => {
    const { c } = seedPath()
    const client = Object.assign(new EventEmitter(), {
      send: () => {},
      isDestroyed: () => false
    }) as unknown as GenerationClient
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failQuiz = true

    createLessonIpc({ db, corpus, service }).start({ requestId: 'r1', topicId: c.topic.id }, client)

    // The first Round quiz Generation fails; the recall batch is still tried.
    await expect.poll(() => callsOf('quiz').length).toBe(2)
  })
})
