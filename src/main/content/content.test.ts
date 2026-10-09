import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LessonEvent, LessonStreamEvent } from '../../shared/lesson'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getCachedContent } from '../db/repositories/contentCache'
import {
  createNotions,
  createTopic,
  listLessonsByTopic,
  listTopics
} from '../db/repositories/learningContent'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure, GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import { prepareQuiz } from '../generation/pipelines'
import { GenerationService, type CliRunner } from '../generation/service'
import { cacheOutline, fixtureCorpus, validQuiz } from '../generation/testing/contentFixtures'
import { createLessonIpc, type LessonIpc } from './lessonIpc'
import { CORPUS_TOPIC_POSITION_OFFSET, listTopicSummaries, seedTopics } from './topics'

const corpus = fixtureCorpus()
const LESSON = '# Le cache\n\n## Cache-aside\n<!-- notion: cache-aside -->\nTexte [source: cache]'

class FakeClient extends EventEmitter implements GenerationClient {
  readonly sent: LessonStreamEvent[] = []
  destroyed = false

  send(channel: string, payload: unknown): void {
    expect(channel).toBe('lesson:event')
    this.sent.push(payload as LessonStreamEvent)
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

let db: Database
let calls: CliCallOptions[]
let client: FakeClient
let service: GenerationService
/** Set to make the next lesson call wait for its abort signal. */
let holdLesson: boolean
/** Set to make every call fail like a logged-out CLI. */
let loggedOut: boolean

const kindOf = (options: CliCallOptions) =>
  options.systemPrompt.includes('Notion Outline')
    ? 'outline'
    : options.jsonSchema
      ? 'quiz'
      : 'lesson'

const runner: CliRunner = (options) =>
  new Promise((resolve, reject) => {
    calls.push(options)
    if (loggedOut) return reject(cliFailure('Not logged in · Please run /login'))
    const kind = kindOf(options)
    // Ungrounded schemas require empty source sections.
    const outline = options.prompt.includes('Foundations Module')
      ? { notions: cacheOutline.notions.map((notion) => ({ ...notion, sourceSections: [] })) }
      : cacheOutline
    options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
    if (kind === 'lesson' && holdLesson) return
    if (kind === 'lesson') {
      options.onEvent?.({ type: 'text_delta', text: LESSON.slice(0, 10) })
      options.onEvent?.({ type: 'text_delta', text: LESSON.slice(10) })
    }
    resolve({
      isError: false,
      subtype: 'success',
      text: kind === 'lesson' ? LESSON : '',
      structuredOutput: kind === 'outline' ? outline : kind === 'quiz' ? validQuiz() : undefined,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    })
  })

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  calls = []
  client = new FakeClient()
  holdLesson = false
  loggedOut = false
  service = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
})

afterEach(() => {
  service.dispose()
  db.close()
})

const ipcFor = (): LessonIpc => createLessonIpc({ db, corpus, service })

const eventsOf = (requestId: string): LessonEvent[] =>
  client.sent.filter((e) => e.requestId === requestId).map((e) => e.event)

const typesOf = (requestId: string) => eventsOf(requestId).map((event) => event.type)

const isEnded = (requestId: string) =>
  eventsOf(requestId).some((event) => event.type === 'done' || event.type === 'error')

const cacheTopicId = () => listTopics(db).find((topic) => topic.slug === 'cache')!.id

describe('seedTopics', () => {
  it('creates one topic per corpus topic, idempotently', () => {
    const created = seedTopics(db, corpus)

    expect(created).toBe(corpus.listTopics().length)
    expect(seedTopics(db, corpus)).toBe(0)
    const topics = listTopics(db)
    expect(topics.map((topic) => topic.slug)).toEqual(corpus.listTopics().map((t) => t.id))
    expect(topics.find((topic) => topic.slug === 'cache')).toMatchObject({
      title: 'Cache',
      sourceSection: 'cache',
      inFoundationsModule: false
    })
  })

  it('skips non-teachable corpus sections when seeding and hides them from the topic list', () => {
    const ids = corpus.listTopics().map((topic) => topic.id)
    const created = seedTopics(db, corpus, [], [ids[0]!])

    expect(created).toBe(ids.length - 1)
    expect(listTopicSummaries(db).map((topic) => topic.slug)).not.toContain(ids[0])
    // a non-teachable topic seeded by an earlier version is hidden from the list too
    createTopic(db, { slug: 'appendix', title: 'Appendix', position: 9999 })
    expect(listTopicSummaries(db).map((topic) => topic.slug)).not.toContain('appendix')
  })

  it('puts Foundations Module topics first and flags them', () => {
    seedTopics(db, corpus)
    const created = seedTopics(db, corpus, [{ slug: 'http', title: 'HTTP' }])

    expect(created).toBe(1)
    const [first, second] = listTopics(db)
    expect(first).toMatchObject({ slug: 'http', inFoundationsModule: true, sourceSection: null })
    expect(second!.position).toBeGreaterThanOrEqual(CORPUS_TOPIC_POSITION_OFFSET)
  })

  it('refuses a Foundations Module slug that clashes with a primer topic', () => {
    expect(() => seedTopics(db, corpus, [{ slug: 'cache', title: 'Cache' }])).toThrow(/clashes/)
  })
})

describe('topic channels', () => {
  it('lists topics and gets one with its Notion Outline status', () => {
    seedTopics(db, corpus)
    const ipc = ipcFor()
    const topicId = cacheTopicId()

    expect(ipc.listTopics().find((t) => t.id === topicId)).toMatchObject({ notionCount: 0 })
    expect(ipc.getTopic({ topicId }).notionOutline).toEqual({ status: 'missing' })

    createNotions(
      db,
      cacheOutline.notions.map((notion) => ({ topicId, ...notion }))
    )
    const detail = ipc.getTopic({ topicId })
    expect(detail.notionCount).toBe(4)
    expect(detail.notionOutline).toMatchObject({
      status: 'ready',
      notions: [{ slug: 'client-caching', title: 'Le cache côté client' }, {}, {}, {}]
    })
  })

  it('rejects an invalid or unknown topic id', () => {
    const ipc = ipcFor()
    expect(() => ipc.getTopic({ topicId: 0 })).toThrow()
    expect(() => ipc.getTopic({ topicId: 99 })).toThrow(/does not exist/)
  })
})

describe('lesson channels', () => {
  beforeEach(() => seedTopics(db, corpus))

  it('generates the outline, streams the lesson, records it and pre-generates the quiz', async () => {
    const ipc = ipcFor()
    const topicId = cacheTopicId()

    ipc.start({ requestId: 'r1', topicId }, client)

    await expect.poll(() => isEnded('r1')).toBe(true)
    expect(typesOf('r1')).toEqual([
      'notion_outline',
      'prepared',
      'queued',
      'started',
      'text_delta',
      'text_delta',
      'done'
    ])
    const prepared = eventsOf('r1')[1] as Extract<LessonEvent, { type: 'prepared' }>
    expect(prepared.grounded).toBe(true)
    expect(prepared.notions.map((n) => n.slug)).toEqual(cacheOutline.notions.map((n) => n.slug))
    expect(prepared.sources[0]).toMatchObject({ sectionId: 'cache', label: 'Cache' })
    expect(prepared.sources[0]!.url).toMatch(/^https:\/\/github\.com\/.+#cache$/)
    expect(eventsOf('r1').at(-1)).toMatchObject({ type: 'done', output: { fromCache: false } })

    expect(listLessonsByTopic(db, topicId)).toMatchObject([{ content: LESSON, grounded: true }])
    await expect.poll(() => calls.map(kindOf)).toEqual(['outline', 'lesson', 'quiz'])
    // The quiz a later foreground request would ask for is already in the Content Cache.
    const quiz = await prepareQuiz({ db, corpus, service }, topicId, { lessonMarkdown: LESSON })
    const key = await service.generate(quiz).result.then((result) => result.cacheKey)
    expect(getCachedContent(db, key!)?.kind).toBe('quiz')
    expect(calls).toHaveLength(3)
  })

  it('serves a second open from the Content Cache without any CLI call', async () => {
    const ipc = ipcFor()
    const topicId = cacheTopicId()
    ipc.start({ requestId: 'r1', topicId }, client)
    await expect.poll(() => calls.length).toBe(3)

    ipc.start({ requestId: 'r2', topicId }, client)

    await expect.poll(() => isEnded('r2')).toBe(true)
    expect(typesOf('r2')).toEqual(['prepared', 'done'])
    expect(eventsOf('r2').at(-1)).toMatchObject({
      type: 'done',
      output: { fromCache: true, content: LESSON }
    })
    expect(calls).toHaveLength(3)
    expect(listLessonsByTopic(db, topicId)).toHaveLength(1)
  })

  it('flags an ungrounded Foundations Module lesson', async () => {
    seedTopics(db, corpus, [{ slug: 'http', title: 'HTTP' }])
    const ipc = ipcFor()
    const topicId = listTopics(db).find((topic) => topic.slug === 'http')!.id

    ipc.start({ requestId: 'r1', topicId }, client)

    await expect.poll(() => isEnded('r1')).toBe(true)
    expect(eventsOf('r1')).toContainEqual(
      expect.objectContaining({ type: 'prepared', grounded: false, sources: [] })
    )
    expect(eventsOf('r1').at(-1)).toMatchObject({ type: 'done', output: { grounded: false } })
  })

  it('cancels a streaming lesson without recording it', async () => {
    holdLesson = true
    const ipc = ipcFor()
    const topicId = cacheTopicId()
    ipc.start({ requestId: 'r1', topicId }, client)
    await expect.poll(() => calls.map(kindOf)).toEqual(['outline', 'lesson'])

    ipc.cancel({ requestId: 'r1' })

    await expect
      .poll(() => eventsOf('r1').at(-1))
      .toMatchObject({
        type: 'error',
        error: { code: 'cancelled' }
      })
    expect(listLessonsByTopic(db, topicId)).toEqual([])
  })

  it('cancels the runs of a destroyed window', async () => {
    holdLesson = true
    const ipc = ipcFor()
    ipc.start({ requestId: 'r1', topicId: cacheTopicId() }, client)
    await expect.poll(() => calls.length).toBe(2)

    client.destroy()

    await expect.poll(() => calls[1]?.signal?.aborted).toBe(true)
  })

  it('ends with a typed, actionable error when the CLI is logged out', async () => {
    loggedOut = true
    const ipc = ipcFor()

    ipc.start({ requestId: 'r1', topicId: cacheTopicId() }, client)

    await expect.poll(() => isEnded('r1')).toBe(true)
    expect(eventsOf('r1').at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'not_logged_in', message: expect.stringMatching(/log in/) }
    })
  })

  it('rejects malformed, duplicate and unknown-topic requests', () => {
    holdLesson = true
    const ipc = ipcFor()
    const topicId = cacheTopicId()

    expect(() => ipc.start({ requestId: '', topicId }, client)).toThrow()
    expect(() => ipc.start({ requestId: 'r1', topicId: 1.5 }, client)).toThrow()
    expect(() => ipc.start({ requestId: 'r1', topicId: 999 }, client)).toThrow(/does not exist/)
    ipc.start({ requestId: 'r2', topicId }, client)
    expect(() => ipc.start({ requestId: 'r2', topicId }, client)).toThrow(/already running/)
  })
})
