import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { flagQuestion, getQuiz, listQuizzesByTopic } from '../db/repositories/assessment'
import {
  createNotions,
  listLessonsByTopic,
  listNotionsByTopic,
  listRemediationLessonsByTopic,
  listTopics
} from '../db/repositories/learningContent'
import type { Topic } from '../db/types'
import type { CliCallOptions } from '../generation/cliRunner'
import type { GenerationClient } from '../generation/ipc'
import {
  prepareLesson,
  prepareRemediationLesson,
  regenerateQuestion
} from '../generation/pipelines'
import {
  UNGROUNDED_RULES,
  type NotionOutline,
  type QuizContent,
  type QuizQuestion
} from '../generation/prompts'
import { GenerationService, type CliRunner } from '../generation/service'
import { fixtureCorpus } from '../generation/testing/contentFixtures'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { createMasteryService } from '../mastery/service'
import { createQuizService, type QuizService } from '../quiz/service'
import type { RoundStart } from '../../shared/quiz'
import { FOUNDATIONS_TOPICS, foundationsGroundedOn } from './foundations'
import { createLessonIpc } from './lessonIpc'
import {
  CORPUS_TOPIC_POSITION_OFFSET,
  listTopicSummaries,
  NON_TEACHABLE_CORPUS_TOPIC_IDS,
  seedTopics
} from './topics'

const corpus = fixtureCorpus()
const primer = loadCorpus(corpusPath(process.cwd()))
const LESSON = '# Le web\n\n## Client et serveur\n<!-- notion: client-server -->\nTexte.'
const REMEDIATION = '## Client et serveur\n\nUne autre façon de voir.'

/** A Notion Outline of `how-the-web-works`, ungrounded (no source sections). */
const webOutline: NotionOutline = {
  notions: [
    ['client-server', 'Client et serveur'],
    ['request-response', 'Requête et réponse'],
    ['http-methods', 'Les méthodes HTTP'],
    ['status-codes', 'Les status codes']
  ].map(([slug, title]) => ({ slug: slug!, title: title!, description: 'D.', sourceSections: [] }))
}

/** The grounded Foundations Module topic and the primer appendix sections it declares. */
const ORDERS = 'orders-of-magnitude'
const APPENDIX_SECTIONS = [
  'appendix',
  'appendix/powers-of-two-table',
  'appendix/latency-numbers-every-programmer-should-know'
]

/** A Notion Outline of `orders-of-magnitude`, grounded on the appendix tables. */
const ordersOutline: NotionOutline = {
  notions: [
    ['back-of-the-envelope', 'Estimer au dos de l’enveloppe', ['appendix']],
    ['powers-of-two', 'Les puissances de deux', ['appendix/powers-of-two-table']],
    [
      'latency-numbers',
      'Les latences à connaître',
      ['appendix/latency-numbers-every-programmer-should-know']
    ]
  ].map(([slug, title, sourceSections]) => ({
    slug: slug as string,
    title: title as string,
    description: 'D.',
    sourceSections: sourceSections as string[]
  }))
}

/** Every trace of grounding a prompt could carry. */
const GROUNDING_MARKERS = ['<excerpt', 'Source excerpts', 'System Design Primer (CC BY 4.0)']

describe('Foundations Module topics', () => {
  it('has 5 to 7 topics with unique kebab-case slugs, French titles and a scope', () => {
    expect(FOUNDATIONS_TOPICS.length).toBeGreaterThanOrEqual(5)
    expect(FOUNDATIONS_TOPICS.length).toBeLessThanOrEqual(7)
    expect(new Set(FOUNDATIONS_TOPICS.map((t) => t.slug)).size).toBe(FOUNDATIONS_TOPICS.length)
    for (const topic of FOUNDATIONS_TOPICS) {
      expect(topic.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(topic.title.length).toBeLessThanOrEqual(100)
      expect(topic.scope).toBeTruthy()
      expect(topic.leftToPrimer).toBeTruthy()
    }
  })

  it('seeds first in the Learning Path with the real primer, flagged, idempotently', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)

    const created = seedTopics(db, primer, FOUNDATIONS_TOPICS)

    const teachable = primer
      .listTopics()
      .filter((topic) => !NON_TEACHABLE_CORPUS_TOPIC_IDS.includes(topic.id))
    expect(created).toBe(FOUNDATIONS_TOPICS.length + teachable.length)
    expect(seedTopics(db, primer, FOUNDATIONS_TOPICS)).toBe(0)
    const summaries = listTopicSummaries(db)
    const foundations = summaries.slice(0, FOUNDATIONS_TOPICS.length)
    expect(foundations.map((t) => t.slug)).toEqual(FOUNDATIONS_TOPICS.map((t) => t.slug))
    expect(foundations.every((t) => t.inFoundationsModule)).toBe(true)
    expect(foundations.every((t) => t.position < CORPUS_TOPIC_POSITION_OFFSET)).toBe(true)
    expect(summaries.slice(FOUNDATIONS_TOPICS.length).some((t) => t.inFoundationsModule)).toBe(
      false
    )
    expect(
      listTopics(db)
        .filter((t) => t.inFoundationsModule)
        .map((t) => t.sourceSection)
    ).toEqual(FOUNDATIONS_TOPICS.map(() => null))
    // Only the seeds that declare grounding sections are grounded (no "Outside the primer").
    expect(foundations.filter((t) => t.grounded).map((t) => t.slug)).toEqual([ORDERS])
    expect(summaries.slice(FOUNDATIONS_TOPICS.length).every((t) => t.grounded)).toBe(true)
    db.close()
  })

  it('grounds orders-of-magnitude on primer appendix sections that exist, others on nothing', () => {
    expect(foundationsGroundedOn(ORDERS)).toEqual(APPENDIX_SECTIONS)
    for (const topic of FOUNDATIONS_TOPICS) {
      if (topic.slug !== ORDERS) expect(foundationsGroundedOn(topic.slug)).toEqual([])
      for (const id of topic.groundedOn ?? []) expect(primer.getSection(id)).toBeDefined()
    }
    // The appendix is not a teachable topic, but its sections stay usable as Excerpts.
    expect(NON_TEACHABLE_CORPUS_TOPIC_IDS).toContain('appendix')
    const excerpts = primer.findExcerpts({ sectionIds: APPENDIX_SECTIONS, limit: 50 })
    expect(excerpts.map((e) => e.sectionId)).toEqual(expect.arrayContaining(APPENDIX_SECTIONS))
  })
})

describe('Foundations Module topic through the whole flow', () => {
  let db: Database
  let calls: CliCallOptions[]
  let generation: GenerationService
  let quiz: QuizService
  let topic: Topic
  let questionCounter: number
  /** What the fake model answers: the outline, and the sections quiz questions cite. */
  let outline: NotionOutline
  let quizSources: string[]

  const kindOf = (options: CliCallOptions) =>
    options.systemPrompt.includes('Notion Outline')
      ? 'outline'
      : options.jsonSchema
        ? 'quiz'
        : options.systemPrompt.includes('remediation lesson')
          ? 'remediation'
          : 'lesson'

  /** A valid ungrounded quiz for the prompt (see the Mastery Loop tests): no source sections. */
  function quizFor(prompt: string): QuizContent {
    const count = Number(/exactly (\d+) question/.exec(prompt)![1])
    const missed = /the notions the learner missed: ([^\n]*?)\./.exec(prompt)?.[1]
    const targets = missed
      ? [...missed.matchAll(/`([\w-]+)`/g)].map((m) => m[1]!)
      : outline.notions.map((n) => n.slug)
    const reminder = /already acquired notions: ([^\n]*?)\./.exec(prompt)?.[1]
    const reminderSlug = reminder ? /`([\w-]+)`/.exec(reminder)?.[1] : undefined
    const forcedType = /Question types allowed: `(\w+)`\./.exec(prompt)?.[1]
    const choices = (correct: number[], total = 4) =>
      Array.from({ length: total }, (_, i) => ({
        text: `Choix ${i}`,
        correct: correct.includes(i)
      }))
    const types = ['single_choice', 'multiple_choice', 'scenario', 'free_answer'] as const
    const questions = Array.from({ length: count }, (_, i): QuizQuestion => {
      const base = {
        prompt: `Question ${++questionCounter} ?`,
        notions: [reminderSlug && i === count - 1 ? reminderSlug : targets[i % targets.length]!],
        sourceSections: quizSources
      }
      const type = (forcedType as QuizQuestion['type'] | undefined) ?? types[i] ?? 'single_choice'
      if (type === 'free_answer') {
        return { type, ...base, expectedPoints: ['Un point.'], modelAnswer: 'Réponse.' }
      }
      if (type === 'multiple_choice') {
        return { type, ...base, choices: choices([0, 1]), explanation: 'E.' }
      }
      if (type === 'scenario') {
        return {
          type,
          ...base,
          scenario: 'Situation.',
          choices: choices([0], 3),
          explanation: 'E.'
        }
      }
      return { type, ...base, choices: choices([0]), explanation: 'E.' }
    })
    return { questions }
  }

  const runner: CliRunner = async (options) => {
    calls.push(options)
    const kind = kindOf(options)
    const text = kind === 'lesson' ? LESSON : kind === 'remediation' ? REMEDIATION : ''
    if (text) options.onEvent?.({ type: 'text_delta', text })
    return {
      isError: false,
      subtype: 'success',
      text,
      structuredOutput:
        kind === 'outline' ? outline : kind === 'quiz' ? quizFor(options.prompt) : undefined,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    }
  }

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, migrations)
    calls = []
    questionCounter = 0
    outline = webOutline
    quizSources = []
    generation = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
    quiz = createQuizService(db)
    seedTopics(db, corpus, FOUNDATIONS_TOPICS)
    topic = listTopics(db).find((t) => t.slug === 'how-the-web-works')!
  })

  afterEach(() => {
    generation.dispose()
    db.close()
  })

  function play(start: RoundStart, wrongOn: string[]) {
    for (const question of start.quiz.questions) {
      if (!question.gradable) continue
      const wrong = question.notions.some((n) => wrongOn.includes(n.slug))
      const selected =
        question.type === 'multiple_choice' ? (wrong ? [2] : [0, 1]) : wrong ? [1] : [0]
      quiz.submitAnswer(start.round.id, { questionId: question.id, answer: { selected } })
    }
    return quiz.completeRound(start.round.id)
  }

  it('stays ungrounded from outline to lesson, quiz, remediation and regenerated question', async () => {
    const sent: { requestId: string; event: { type: string; grounded?: boolean } }[] = []
    const client = Object.assign(new EventEmitter(), {
      send: (_channel: string, payload: (typeof sent)[number]) => sent.push(payload),
      isDestroyed: () => false
    }) as unknown as GenerationClient

    // Lesson flow: outline, streamed lesson, quiz Pre-generation.
    createLessonIpc({ db, corpus, service: generation }).start(
      { requestId: 'lesson', topicId: topic.id },
      client
    )
    await vi.waitFor(() => expect(calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz']))
    expect(sent.map((s) => s.event)).toContainEqual(
      expect.objectContaining({ type: 'prepared', grounded: false })
    )
    expect(listLessonsByTopic(db, topic.id)).toMatchObject([
      { grounded: false, sourceSections: [] }
    ])
    expect(listNotionsByTopic(db, topic.id).every((n) => n.sourceSections.length === 0)).toBe(true)

    // Mastery Loop: the first round plays the pre-generated quiz, fails on one notion.
    const mastery = createMasteryService({ db, corpus, service: generation, quiz })
    await vi.waitFor(() =>
      expect(db.prepare("SELECT grounded FROM content_cache WHERE kind = 'quiz'").get()).toEqual({
        grounded: 0
      })
    )
    const start = await mastery.startRound(topic.id)
    expect(calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz'])
    expect(start.quiz.grounded).toBe(false)
    expect(listQuizzesByTopic(db, topic.id)).toMatchObject([
      { grounded: false, sourceSections: [] }
    ])
    expect(play(start, ['client-server']).round.passed).toBe(false)

    // Remediation Lesson on the missed notion.
    const state = mastery.getState(topic.id)
    if (state.step.name !== 'remediation') throw new Error(`step is ${state.step.name}`)
    const run = mastery.prepareRemediation(topic.id, state.step.targets[0]!.notion.id)
    const remediation = await generation.generate(run.request).result
    mastery.recordRemediation(run, remediation)
    expect(remediation).toMatchObject({ grounded: false, sourceSections: [] })
    expect(listRemediationLessonsByTopic(db, topic.id)).toMatchObject([{ grounded: false }])

    // Next round (targeted), then a flagged question regenerated.
    const second = await mastery.startRound(topic.id)
    expect(getQuiz(db, second.quiz.id)).toMatchObject({ grounded: false, sourceSections: [] })
    flagQuestion(db, second.quiz.questions[0]!.id, 'Ambiguë')
    await regenerateQuestion({ db, corpus, service: generation }, second.quiz.questions[0]!.id)

    expect(calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz', 'remediation', 'quiz', 'quiz'])
    // The outline is steered by the topic's scope; no prompt carries any primer excerpt.
    expect(calls[0]!.prompt).toContain(FOUNDATIONS_TOPICS[0]!.scope!)
    expect(calls[0]!.prompt).toContain('Leave out (taught later in grounded topics')
    for (const call of calls) {
      for (const marker of GROUNDING_MARKERS) expect(call.prompt).not.toContain(marker)
      if (kindOf(call) !== 'outline') expect(call.prompt).toContain(UNGROUNDED_RULES)
    }
  })

  it('grounds orders-of-magnitude on the primer appendix from outline to regenerated question', async () => {
    const orders = listTopics(db).find((t) => t.slug === ORDERS)!
    const deps = { db, corpus: primer, service: generation }
    outline = ordersOutline
    quizSources = ['appendix/powers-of-two-table']
    const sent: { requestId: string; event: { type: string; grounded?: boolean } }[] = []
    const client = Object.assign(new EventEmitter(), {
      send: (_channel: string, payload: (typeof sent)[number]) => sent.push(payload),
      isDestroyed: () => false
    }) as unknown as GenerationClient

    createLessonIpc(deps).start({ requestId: 'lesson', topicId: orders.id }, client)
    await vi.waitFor(() => expect(calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz']))
    expect(sent.map((s) => s.event)).toContainEqual(
      expect.objectContaining({ type: 'prepared', grounded: true })
    )
    expect(listLessonsByTopic(db, orders.id)).toMatchObject([
      { grounded: true, sourceSections: APPENDIX_SECTIONS }
    ])

    const mastery = createMasteryService({ ...deps, quiz })
    await vi.waitFor(() =>
      expect(db.prepare("SELECT grounded FROM content_cache WHERE kind = 'quiz'").get()).toEqual({
        grounded: 1
      })
    )
    const start = await mastery.startRound(orders.id)
    expect(start.quiz.grounded).toBe(true)
    expect(play(start, ['latency-numbers']).round.passed).toBe(false)

    const state = mastery.getState(orders.id)
    if (state.step.name !== 'remediation') throw new Error(`step is ${state.step.name}`)
    const run = mastery.prepareRemediation(orders.id, state.step.targets[0]!.notion.id)
    const remediation = await generation.generate(run.request).result
    mastery.recordRemediation(run, remediation)
    expect(remediation).toMatchObject({
      grounded: true,
      sourceSections: ['appendix/latency-numbers-every-programmer-should-know']
    })

    const second = await mastery.startRound(orders.id)
    expect(getQuiz(db, second.quiz.id)).toMatchObject({ grounded: true })
    flagQuestion(db, second.quiz.questions[0]!.id, 'Ambiguë')
    await regenerateQuestion(deps, second.quiz.questions[0]!.id)

    expect(calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz', 'remediation', 'quiz', 'quiz'])
    // Every prompt carries appendix excerpts and the grounded rules, never the ungrounded ones.
    for (const call of calls) {
      expect(call.prompt).toContain('<excerpt id="appendix/')
      expect(call.prompt).not.toContain(UNGROUNDED_RULES)
    }
    expect(calls[0]!.prompt).toContain('<excerpt id="appendix/powers-of-two-table"')
  })

  describe('with the fake CLI', () => {
    let fake: FakeCli
    let service: GenerationService

    beforeEach(() => {
      fake = installFakeCli()
      service = new GenerationService({
        db,
        cli: { env: fake.env },
        resolveCli: async () => fake.bin
      })
      createNotions(
        db,
        webOutline.notions.map((notion) => ({ topicId: topic.id, ...notion }))
      )
    })

    afterEach(() => {
      service.dispose()
      fake.cleanup()
    })

    it('streams an ungrounded lesson and Remediation Lesson without any excerpt', async () => {
      const deps = { db, corpus, service }
      const lesson = await service.generate(await prepareLesson(deps, topic.id)).result
      const notion = listNotionsByTopic(db, topic.id)[0]!
      const remediation = await service.generate(
        prepareRemediationLesson(deps, notion.id, { angle: 'analogy' })
      ).result

      expect(lesson).toMatchObject({ grounded: false, sourceSections: [] })
      expect(remediation).toMatchObject({ grounded: false, sourceSections: [] })
      const stdins = fake.calls().map((call) => call.stdin)
      expect(stdins).toHaveLength(2)
      for (const stdin of stdins) {
        expect(stdin).toContain('Foundations Module')
        for (const marker of GROUNDING_MARKERS) expect(stdin).not.toContain(marker)
      }
    })
  })
})
