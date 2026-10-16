import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LessonEvent, LessonStreamEvent } from '../../shared/lesson'
import { generationLanguages } from '../../shared/generationLanguage'
import type { LessonQuestionAskRequest } from '../../shared/lessonQuestion'
import { seedTopics } from '../content/topics'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { completeRound } from '../db/repositories/assessment'
import { createNotions, listTopics } from '../db/repositories/learningContent'
import { updateSettings } from '../db/repositories/settings'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure, GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import { saveQuiz } from '../generation/pipelines'
import { languageRules } from '../generation/prompts'
import { GenerationService, type CliRunner } from '../generation/service'
import { cacheOutline, fixtureCorpus, validQuiz } from '../generation/testing/contentFixtures'
import { createQuizIpc } from '../ipc/quiz'
import { createQuizService } from '../quiz/service'
import {
  createLessonQuestionIpc,
  OPEN_ROUND_REFUSAL,
  type LessonQuestionIpc
} from './lessonQuestionIpc'

const corpus = fixtureCorpus()
const LESSON =
  '# Le cache\n\n## Cache-aside\n<!-- notion: cache-aside -->\nL’application lit le cache.'
const SELECTION = 'L’application lit le cache.'
const QUESTION = 'Pourquoi le cache d’abord ?'
const ANSWER = 'Parce que le cache est plus rapide que la base de données.'

class FakeClient extends EventEmitter implements GenerationClient {
  readonly sent: LessonStreamEvent[] = []
  destroyed = false

  send(channel: string, payload: unknown): void {
    expect(channel).toBe('lessonQuestion:event')
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
let hold: boolean
let loggedOut: boolean

const runner: CliRunner = (options) =>
  new Promise((resolve, reject) => {
    calls.push(options)
    if (loggedOut) return reject(cliFailure('Not logged in · Please run /login'))
    options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
    if (hold) return
    options.onEvent?.({ type: 'text_delta', text: ANSWER.slice(0, 12) })
    options.onEvent?.({ type: 'text_delta', text: ANSWER.slice(12) })
    resolve({
      isError: false,
      subtype: 'success',
      text: ANSWER,
      structuredOutput: undefined,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    })
  })

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  seedTopics(db, corpus)
  calls = []
  client = new FakeClient()
  hold = false
  loggedOut = false
  service = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
})

afterEach(() => {
  service.dispose()
  db.close()
})

const ipcFor = (assertTopicUnlocked?: (topicId: number) => void): LessonQuestionIpc =>
  createLessonQuestionIpc({ db, corpus, service }, { assertTopicUnlocked })

const cacheTopicId = () => listTopics(db).find((topic) => topic.slug === 'cache')!.id

const cacheNotionIds = () =>
  createNotions(
    db,
    cacheOutline.notions.map((notion) => ({ topicId: cacheTopicId(), ...notion }))
  ).map((notion) => notion.id)

const lessonRequest = (
  overrides: Partial<LessonQuestionAskRequest> = {}
): LessonQuestionAskRequest => ({
  requestId: 'q1',
  context: { kind: 'lesson', topicId: cacheTopicId() },
  lesson: LESSON,
  selection: SELECTION,
  question: QUESTION,
  thread: [],
  ...overrides
})

const eventsOf = (requestId: string): LessonEvent[] =>
  client.sent.filter((e) => e.requestId === requestId).map((e) => e.event)

const isEnded = (requestId: string) =>
  eventsOf(requestId).some((event) => event.type === 'done' || event.type === 'error')

/** Row count of every table: a Lesson Question must leave all of them as they were. */
function tableCounts(): Record<string, number> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all<{ name: string }>()
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      db.prepare(`SELECT count(*) AS n FROM "${name}"`).get<{ n: number }>()!.n
    ])
  )
}

describe('lessonQuestion:ask', () => {
  it('streams a grounded answer: prepared, then the Generation events', async () => {
    const ipc = ipcFor()

    ipc.ask(lessonRequest(), client)

    await expect.poll(() => isEnded('q1')).toBe(true)
    expect(eventsOf('q1').map((e) => e.type)).toEqual([
      'prepared',
      'queued',
      'started',
      'text_delta',
      'text_delta',
      'done'
    ])
    const prepared = eventsOf('q1')[0] as Extract<LessonEvent, { type: 'prepared' }>
    expect(prepared.grounded).toBe(true)
    expect(prepared.sources[0]).toMatchObject({ sectionId: 'cache', label: 'Cache' })
    expect(eventsOf('q1').at(-1)).toMatchObject({
      type: 'done',
      output: { content: ANSWER, fromCache: false }
    })
  })

  it.each(generationLanguages)(
    'answers in the Generation Language of the setting (%s), when it is asked',
    async (language) => {
      updateSettings(db, { generationLanguage: language })
      const other = language === 'fr' ? 'en' : 'fr'

      ipcFor().ask(lessonRequest(), client)

      await expect.poll(() => isEnded('q1')).toBe(true)
      expect(calls[0]!.systemPrompt).toContain(languageRules(language))
      expect(calls[0]!.systemPrompt).not.toContain(languageRules(other))
    }
  )

  it('gives the CLI the selection, the question, the Lesson and the Excerpts of the topic', async () => {
    ipcFor().ask(
      lessonRequest({
        thread: [
          { selection: 'Passage avant', question: 'Question avant', answer: 'Réponse avant' }
        ]
      }),
      client
    )

    await expect.poll(() => isEnded('q1')).toBe(true)
    expect(calls).toHaveLength(1)
    const { prompt, systemPrompt, jsonSchema } = calls[0]!
    expect(prompt).toContain(SELECTION)
    expect(prompt).toContain(QUESTION)
    expect(prompt).toContain('# Le cache')
    expect(prompt).toContain('<excerpt id="cache"')
    expect(prompt).toContain('Question avant')
    expect(systemPrompt).toContain('patient system design tutor')
    expect(jsonSchema).toBeUndefined()
  })

  it('stores nothing: no Content Cache entry, no row in any table', async () => {
    const before = tableCounts()

    ipcFor().ask(lessonRequest(), client)
    await expect.poll(() => isEnded('q1')).toBe(true)
    // A follow-up question, same selection.
    ipcFor().ask(lessonRequest({ requestId: 'q2' }), client)
    await expect.poll(() => isEnded('q2')).toBe(true)

    expect(calls).toHaveLength(2)
    expect(tableCounts()).toEqual(before)
    expect(before['content_cache']).toBe(0)
  })

  it('grounds a Remediation Lesson question on its notion, and refuses a notion of another topic', async () => {
    const [firstNotionId] = cacheNotionIds()
    const ipc = ipcFor()

    ipc.ask(
      lessonRequest({
        context: { kind: 'remediation', topicId: cacheTopicId(), notionId: firstNotionId! }
      }),
      client
    )
    await expect.poll(() => isEnded('q1')).toBe(true)
    // The notion's own section (client-caching), not the whole topic.
    expect(calls[0]!.prompt).toContain('<excerpt id="cache/client-caching"')
    expect(calls[0]!.prompt).toContain('Remediation Lesson on one notion: "Le cache côté client"')

    const other = listTopics(db).find((topic) => topic.slug !== 'cache')!
    expect(() =>
      ipc.ask(
        lessonRequest({
          requestId: 'q2',
          context: { kind: 'remediation', topicId: other.id, notionId: firstNotionId! }
        }),
        client
      )
    ).toThrow(/is not a notion of topic/)
  })

  it('answers about a Protocol Step Lesson without any topic', async () => {
    ipcFor().ask(lessonRequest({ context: { kind: 'protocol_step', step: 'estimations' } }), client)

    await expect.poll(() => isEnded('q1')).toBe(true)
    expect(calls[0]!.prompt).toContain('Protocol Step Lesson')
    expect(calls[0]!.prompt).toContain('Estimations')
    expect(eventsOf('q1').at(-1)).toMatchObject({ type: 'done' })
  })

  it('goes through the Learning Path lock like the Lesson does', () => {
    const locked = ipcFor(() => {
      throw new Error('locked')
    })

    expect(() => locked.ask(lessonRequest(), client)).toThrow('locked')
    expect(client.sent).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it('cancels a running answer, and the runs of a destroyed window', async () => {
    hold = true
    const ipc = ipcFor()
    ipc.ask(lessonRequest(), client)
    await expect.poll(() => calls.length).toBe(1)

    ipc.cancel({ requestId: 'q1' })

    await expect
      .poll(() => eventsOf('q1').at(-1))
      .toMatchObject({ type: 'error', error: { code: 'cancelled' } })

    ipc.ask(lessonRequest({ requestId: 'q2' }), client)
    await expect.poll(() => calls.length).toBe(2)
    client.destroy()
    await expect.poll(() => calls[1]?.signal?.aborted).toBe(true)
  })

  it('ends with a typed, actionable error when the CLI is logged out', async () => {
    loggedOut = true

    ipcFor().ask(lessonRequest(), client)

    await expect.poll(() => isEnded('q1')).toBe(true)
    expect(eventsOf('q1').at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'not_logged_in', message: expect.stringMatching(/log in/i) }
    })
  })

  it('rejects malformed, oversized and duplicate requests', () => {
    hold = true
    const ipc = ipcFor()

    expect(() => ipc.ask(lessonRequest({ requestId: '' }), client)).toThrow()
    expect(() => ipc.ask(lessonRequest({ question: '   ' }), client)).toThrow()
    expect(() => ipc.ask(lessonRequest({ selection: 'x'.repeat(5000) }), client)).toThrow()
    expect(() =>
      ipc.ask(lessonRequest({ context: { kind: 'lesson', topicId: 0 } }), client)
    ).toThrow()
    expect(() =>
      ipc.ask(lessonRequest({ context: { kind: 'protocol_step', step: 'nope' as never } }), client)
    ).toThrow()
    expect(() =>
      ipc.ask(lessonRequest({ context: { kind: 'lesson', topicId: 999 } }), client)
    ).toThrow(/does not exist/)
    expect(calls).toHaveLength(0)

    ipc.ask(lessonRequest(), client)
    expect(() => ipc.ask(lessonRequest(), client)).toThrow(/already running/)
  })
})

describe('Lesson Question and the Quiz rounds', () => {
  /** A cache topic with notions and a saved quiz, ready to play. */
  function setUpQuiz() {
    const topicId = cacheTopicId()
    cacheNotionIds()
    const quiz = saveQuiz(
      db,
      topicId,
      {
        content: validQuiz(),
        grounded: true,
        sourceSections: [],
        cacheKey: null
      },
      'fr'
    )
    return { topicId, quizId: quiz.id }
  }

  it('is refused while a Quiz round of the topic is open, and allowed again once it is completed', async () => {
    const { topicId, quizId } = setUpQuiz()
    const quiz = createQuizIpc(db, createQuizService(db), { allowDevFixture: false })
    const ipc = ipcFor()
    const { round } = quiz.startRound({ quizId })
    const countsBefore = tableCounts()

    for (const context of [
      { kind: 'lesson', topicId } as const,
      { kind: 'remediation', topicId, notionId: cacheNotionIdsOf(topicId)[0]! } as const
    ]) {
      expect(() => ipc.ask(lessonRequest({ context }), client)).toThrow(OPEN_ROUND_REFUSAL)
    }
    expect(calls).toHaveLength(0)
    expect(client.sent).toHaveLength(0)
    expect(tableCounts()).toEqual(countsBefore)

    completeRound(db, round.id, { scorePercent: 0, passed: false })
    ipc.ask(lessonRequest(), client)
    await expect.poll(() => isEnded('q1')).toBe(true)
    expect(eventsOf('q1').at(-1)).toMatchObject({ type: 'done' })
  })

  it('does not write to the quiz, round, attempt or mastery tables', async () => {
    const { topicId, quizId } = setUpQuiz()
    const quiz = createQuizIpc(db, createQuizService(db), { allowDevFixture: false })
    const { round } = quiz.startRound({ quizId })
    completeRound(db, round.id, { scorePercent: 50, passed: false })
    const watched = [
      'quizzes',
      'questions',
      'question_notions',
      'rounds',
      'attempts',
      'remediation_lessons',
      'lessons',
      'notions'
    ]
    const snapshot = () => watched.map((table) => tableCounts()[table])
    const before = snapshot()
    expect(before.every((count) => count !== undefined)).toBe(true)

    ipcFor().ask(lessonRequest({ context: { kind: 'lesson', topicId } }), client)
    await expect.poll(() => isEnded('q1')).toBe(true)

    expect(snapshot()).toEqual(before)
    expect(
      db
        .prepare('SELECT completed_at AS done, score_percent AS score FROM rounds WHERE id = $id')
        .get<{ done: string | null; score: number }>({ id: round.id })
    ).toMatchObject({ score: 50 })
  })

  function cacheNotionIdsOf(topicId: number): number[] {
    return db
      .prepare('SELECT id FROM notions WHERE topic_id = $topicId ORDER BY id')
      .all<{ id: number }>({ topicId })
      .map((row) => row.id)
  }
})
