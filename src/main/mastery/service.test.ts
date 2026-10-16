import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MasteryEvent, MasteryStreamEvent } from '../../shared/mastery'
import type { RoundResult, RoundStart } from '../../shared/quiz'
import { createHash } from 'node:crypto'
import { generationLanguages, type GenerationLanguage } from '../../shared/generationLanguage'
import { createLessonIpc } from '../content/lessonIpc'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getQuiz, listRoundsByTopic } from '../db/repositories/assessment'
import { contentCacheKey, getCachedContent } from '../db/repositories/contentCache'
import {
  createLesson,
  createNotions,
  createTopic,
  listRemediationLessonsByTopic
} from '../db/repositories/learningContent'
import { updateSettings } from '../db/repositories/settings'
import type { Notion, Topic } from '../db/types'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import {
  languageRules,
  QUIZ_PROMPT_VERSION,
  type QuizContent,
  type QuizQuestion
} from '../generation/prompts'
import { GenerationService, type CliRunner } from '../generation/service'
import { cacheOutline, fixtureCorpus } from '../generation/testing/contentFixtures'
import { createTopicLockGuard } from '../path/lock'
import { createQuizService, type QuizService } from '../quiz/service'
import { createMasteryIpc } from './masteryIpc'
import { getTopicMastery, latestNotionScores } from './queries'
import { createMasteryService, type MasteryService } from './service'

const corpus = fixtureCorpus()
const LESSON = '# Le cache\n\n## Cache-aside\n<!-- notion: cache-aside -->\nTexte [source: cache]'
const REMEDIATION = '## Cache-aside\n\nUne autre façon de voir. [source: cache]'

let db: Database
let topic: Topic
let notions: Notion[]
let calls: CliCallOptions[]
let questionCounter: number
let loggedOut: boolean
let generation: GenerationService
let quiz: QuizService
let mastery: MasteryService

const kindOf = (options: CliCallOptions) =>
  options.systemPrompt.includes('Notion Outline')
    ? 'outline'
    : options.jsonSchema
      ? 'quiz'
      : options.systemPrompt.includes('remediation lesson')
        ? 'remediation'
        : 'lesson'

/**
 * A valid quiz for the prompt: the requested count, every type, question i tagged with target
 * notion i (round robin), fresh prompts. Correct choices: index 0 (and 1 for multiple choice).
 */
function quizFor(prompt: string): QuizContent {
  const count = Number(/exactly (\d+) question/.exec(prompt)![1])
  const missed = /the notions the learner missed: ([^\n]*?)\./.exec(prompt)?.[1]
  const targets = missed
    ? [...missed.matchAll(/`([\w-]+)`/g)].map((m) => m[1]!)
    : notions.map((n) => n.slug)
  // Targeted rounds must include a reminder question on an already acquired notion.
  const reminder = /already acquired notions: ([^\n]*?)\./.exec(prompt)?.[1]
  const reminderSlug = reminder ? /`([\w-]+)`/.exec(reminder)?.[1] : undefined
  const choices = (correct: number[], total = 4) =>
    Array.from({ length: total }, (_, i) => ({ text: `Choix ${i}`, correct: correct.includes(i) }))
  const types = ['single_choice', 'multiple_choice', 'scenario', 'free_answer'] as const
  const questions = Array.from({ length: count }, (_, i): QuizQuestion => {
    const base = {
      prompt: `Question ${++questionCounter} ?`,
      notions: [reminderSlug && i === count - 1 ? reminderSlug : targets[i % targets.length]!],
      sourceSections: ['cache']
    }
    const type = types[i] ?? 'single_choice'
    if (type === 'free_answer') {
      return { type, ...base, expectedPoints: ['Un point.'], modelAnswer: 'Réponse.' }
    }
    if (type === 'multiple_choice') {
      return { type, ...base, choices: choices([0, 1]), explanation: 'E.' }
    }
    if (type === 'scenario') {
      return { type, ...base, scenario: 'Situation.', choices: choices([0], 3), explanation: 'E.' }
    }
    return { type, ...base, choices: choices([0]), explanation: 'E.' }
  })
  return { questions }
}

const runner: CliRunner = async (options) => {
  calls.push(options)
  if (loggedOut) throw cliFailure('Not logged in · Please run /login')
  const kind = kindOf(options)
  const text = kind === 'lesson' ? LESSON : kind === 'remediation' ? REMEDIATION : ''
  if (text) options.onEvent?.({ type: 'text_delta', text })
  return {
    isError: false,
    subtype: 'success',
    text,
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
  questionCounter = 0
  loggedOut = false
  topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1, sourceSection: 'cache' })
  notions = createNotions(
    db,
    cacheOutline.notions.map((notion) => ({ topicId: topic.id, ...notion }))
  )
  generation = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
  quiz = createQuizService(db)
  mastery = createMasteryService({ db, corpus, service: generation, quiz })
})

afterEach(() => {
  generation.dispose()
  db.close()
})

const slugOf = (slug: string) => notions.find((n) => n.slug === slug)!

const readLesson = () =>
  createLesson(db, {
    topicId: topic.id,
    content: LESSON,
    grounded: true,
    sourceSections: ['cache']
  })

/** Answers every gradable question not answered yet: wrong on the given notions, right otherwise. */
function play(
  start: RoundStart,
  wrongOn: string[] = [],
  answered = start.answered.map((a) => a.questionId)
): RoundResult {
  for (const question of start.quiz.questions) {
    if (!question.gradable || answered.includes(question.id)) continue
    const wrong = question.notions.some((n) => wrongOn.includes(n.slug))
    const selected =
      question.type === 'multiple_choice' ? (wrong ? [2] : [0, 1]) : wrong ? [1] : [0]
    quiz.submitAnswer(start.round.id, { questionId: question.id, answer: { selected } })
  }
  return quiz.completeRound(start.round.id)
}

/** Generates and records the Remediation Lessons of the current remediation step. */
async function readRemediations(): Promise<string[]> {
  const state = mastery.getState(topic.id)
  if (state.step.name !== 'remediation') throw new Error(`step is ${state.step.name}`)
  const angles: string[] = []
  for (const target of state.step.targets) {
    const run = mastery.prepareRemediation(topic.id, target.notion.id)
    mastery.recordRemediation(run, await generation.generate(run.request).result)
    angles.push(target.angle)
  }
  return angles
}

describe('first round', () => {
  it.each([
    ['automatic', null],
    ['8', 8]
  ])(
    'uses the quiz pre-generated by the lesson flow (questions per quiz: %s)',
    async (_label, questionsPerQuiz) => {
      updateSettings(db, { questionsPerQuiz })
      const sent: { requestId: string; event: { type: string } }[] = []
      const client = Object.assign(new EventEmitter(), {
        send: (_channel: string, payload: (typeof sent)[number]) => sent.push(payload),
        isDestroyed: () => false
      }) as unknown as GenerationClient
      createLessonIpc({ db, corpus, service: generation }).start(
        { requestId: 'lesson', topicId: topic.id },
        client
      )
      await vi.waitFor(() => expect(callsOf('quiz')).toHaveLength(1))
      const pregenerated = await vi.waitFor(() => {
        const entry = db
          .prepare("SELECT cache_key AS key FROM content_cache WHERE kind = 'quiz'")
          .get<{ key: string }>()
        expect(entry).toBeDefined()
        return entry!.key
      })

      const request = await mastery.nextQuizRequest(topic.id)
      expect(contentCacheKey('quiz', request.input, QUIZ_PROMPT_VERSION, 'fr')).toBe(pregenerated)

      const start = await mastery.startRound(topic.id)
      expect(callsOf('quiz')).toHaveLength(1)
      expect(start.round.number).toBe(1)
      expect(getQuiz(db, start.quiz.id)!.contentCacheKey).toBe(pregenerated)
      expect(start.quiz.questions).toHaveLength(questionsPerQuiz ?? 6)
    }
  )

  it('refuses to start before the lesson exists', async () => {
    await expect(mastery.startRound(topic.id)).rejects.toThrow(/Read the lesson/)
    expect(mastery.getState(topic.id)).toMatchObject({
      status: 'not_started',
      step: { name: 'lesson', lessonReady: false }
    })
  })
})

describe('Mastery Loop', () => {
  it('passes the first time', async () => {
    readLesson()
    const result = play(await mastery.startRound(topic.id))

    expect(result.round.passed).toBe(true)
    expect(mastery.getState(topic.id)).toMatchObject({
      status: 'mastered',
      step: { name: 'mastered', roundId: result.round.id },
      lastRound: { number: 1, passed: true }
    })
    expect(getTopicMastery(db, topic.id)).toBe('mastered')
  })

  it('fails, remediates the missed notion only, then passes a targeted quiz', async () => {
    readLesson()
    const first = await mastery.startRound(topic.id)
    const firstPrompts = first.quiz.questions.map((q) => q.prompt)
    expect(play(first, ['cache-aside']).round.passed).toBe(false)

    const state = mastery.getState(topic.id)
    expect(state).toMatchObject({ status: 'in_progress', roundNumber: 2, failedRounds: 1 })
    if (state.step.name !== 'remediation') throw new Error('expected remediation')
    expect(state.step.targets.map((t) => t.notion.slug)).toEqual(['cache-aside'])
    await expect(mastery.startRound(topic.id)).rejects.toThrow(/Remediation Lessons/)
    expect(() => mastery.prepareRemediation(topic.id, slugOf('write-through').id)).toThrow(
      /not missed/
    )

    // The Remediation Lesson targets the missed questions, from the first angle.
    const run = mastery.prepareRemediation(topic.id, slugOf('cache-aside').id)
    const missed = first.quiz.questions
      .filter((q) => q.gradable && q.notions.some((n) => n.slug === 'cache-aside'))
      .map((q) => q.prompt)
    expect(run.request.input).toMatchObject({
      notion: { slug: 'cache-aside' },
      angle: 'concrete_example',
      missedQuestionPrompts: missed,
      usedAngles: []
    })
    const output = await generation.generate(run.request).result
    mastery.recordRemediation(run, output)
    // Cached, and recorded once per round and notion.
    const again = await generation.generate(run.request).result
    expect(again.fromCache).toBe(true)
    mastery.recordRemediation(run, again)
    expect(listRemediationLessonsByTopic(db, topic.id)).toMatchObject([
      { notionId: slugOf('cache-aside').id, roundId: first.round.id, content: REMEDIATION }
    ])
    expect(callsOf('remediation')).toHaveLength(1)

    // Next quiz: fresh questions on the missed notion, reminders of the others.
    const request = await mastery.nextQuizRequest(topic.id)
    expect(request.input).toMatchObject({
      targetNotions: ['cache-aside'],
      notions: ['cache-aside', 'client-caching', 'write-through', 'cache-consistency'],
      avoidPrompts: firstPrompts
    })
    const second = await mastery.startRound(topic.id)
    expect(second.round.number).toBe(2)
    expect(callsOf('quiz').at(-1)!.prompt).toContain(
      'the notions the learner missed: `cache-aside`'
    )
    expect(second.quiz.questions.map((q) => q.prompt)).not.toContain(firstPrompts[0])

    expect(play(second).round.passed).toBe(true)
    expect(getTopicMastery(db, topic.id)).toBe('mastered')
    const latest = latestNotionScores(db, topic.id)
    expect(latest.find((n) => n.slug === 'cache-aside')).toMatchObject({
      roundNumber: 2,
      scorePercent: 100
    })
    // The first acquired notion was re-tested by the mandatory reminder question; the others were not.
    expect(latest.find((n) => n.slug === 'client-caching')).toMatchObject({ roundNumber: 2 })
    expect(latest.find((n) => n.slug === 'write-through')).toMatchObject({ roundNumber: 1 })
  })

  it('reaches the Round Limit: skip, come back, another angle', async () => {
    updateSettings(db, { roundLimit: 2 })
    readLesson()
    play(await mastery.startRound(topic.id), ['cache-aside'])
    expect(await readRemediations()).toEqual(['concrete_example'])
    play(await mastery.startRound(topic.id), ['cache-aside'])

    expect(mastery.getState(topic.id)).toMatchObject({
      status: 'limit_reached',
      step: { name: 'limit_reached' },
      failedRounds: 2,
      roundLimit: 2
    })
    await expect(mastery.startRound(topic.id)).rejects.toThrow(/Round Limit/)

    expect(mastery.choose(topic.id, 'skip')).toMatchObject({ status: 'skipped' })
    expect(getTopicMastery(db, topic.id)).toBe('skipped')
    await expect(mastery.startRound(topic.id)).rejects.toThrow(/skipped/)
    expect(() => mastery.choose(topic.id, 'skip')).toThrow(/no Round Limit choice/)

    const back = mastery.choose(topic.id, 'another_angle')
    expect(back).toMatchObject({ status: 'in_progress', step: { anotherAngle: true } })
    const run = mastery.prepareRemediation(topic.id, slugOf('cache-aside').id)
    expect(run.request.input).toMatchObject({
      angle: 'analogy',
      usedAngles: ['concrete_example']
    })
    expect(run.request.prompt.user).toContain('already read remediation lessons')
    await readRemediations()

    // A third failure offers the choice again; a pass masters the topic.
    play(await mastery.startRound(topic.id), ['cache-aside'])
    expect(mastery.getState(topic.id)).toMatchObject({ status: 'limit_reached', failedRounds: 3 })
    mastery.choose(topic.id, 'another_angle')
    expect(await readRemediations()).toEqual(['contrast'])
    play(await mastery.startRound(topic.id))
    expect(mastery.getState(topic.id)).toMatchObject({ status: 'mastered', roundNumber: 5 })
    expect(listRoundsByTopic(db, topic.id).map((r) => [r.number, r.passed])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true]
    ])
  })

  it('resumes an abandoned round after a restart, without a new number or Generation', async () => {
    readLesson()
    const start = await mastery.startRound(topic.id)
    const firstQuestion = start.quiz.questions[0]!
    quiz.submitAnswer(start.round.id, { questionId: firstQuestion.id, answer: { selected: [1] } })
    const quizCalls = callsOf('quiz').length

    // Restart: new services on the same database.
    const restarted = createMasteryService({
      db,
      corpus,
      service: generation,
      quiz: createQuizService(db)
    })
    expect(restarted.getState(topic.id)).toMatchObject({
      step: { name: 'round', roundId: start.round.id },
      roundNumber: 1,
      failedRounds: 0
    })
    const resumed = await restarted.startRound(topic.id)
    expect(resumed.round.id).toBe(start.round.id)
    expect(resumed.answered.map((a) => a.questionId)).toEqual([firstQuestion.id])
    expect(callsOf('quiz')).toHaveLength(quizCalls)

    play(resumed)
    expect(restarted.getState(topic.id)).toMatchObject({ roundNumber: 2, failedRounds: 1 })
  })

  it('applies a Mastery Threshold change between rounds', async () => {
    readLesson()
    // 5 gradable questions, one wrong: 80%, below the default 100%.
    const first = await mastery.startRound(topic.id)
    const result = play(first, ['write-through'])
    expect(result.round).toMatchObject({ passed: false, scorePercent: 80 })

    updateSettings(db, { masteryThreshold: 75 })
    const state = mastery.getState(topic.id)
    // The failed round stays failed; the targets follow the new threshold.
    expect(state).toMatchObject({ masteryThreshold: 75, failedRounds: 1 })
    if (state.step.name !== 'remediation') throw new Error('expected remediation')
    expect(state.step.targets.map((t) => t.notion.slug)).toEqual(['write-through'])
    await readRemediations()
    const second = await mastery.startRound(topic.id)
    // 6 questions on write-through, 1 free answer skipped: one wrong is 80%, now enough.
    const [wrongOnce] = second.quiz.questions.filter((q) => q.gradable)
    quiz.submitAnswer(second.round.id, {
      questionId: wrongOnce!.id,
      answer: { selected: wrongOnce!.type === 'multiple_choice' ? [2] : [1] }
    })
    expect(play(second, [], [wrongOnce!.id]).round.passed).toBe(true)
  })
})

describe('mastery IPC', () => {
  class FakeClient extends EventEmitter implements GenerationClient {
    readonly sent: MasteryStreamEvent[] = []
    send(channel: string, payload: unknown): void {
      expect(channel).toBe('mastery:event')
      this.sent.push(payload as MasteryStreamEvent)
    }
    isDestroyed = () => false
  }

  const eventsOf = (client: FakeClient, requestId: string): MasteryEvent[] =>
    client.sent.filter((e) => e.requestId === requestId).map((e) => e.event)

  const ended = (client: FakeClient, requestId: string) =>
    eventsOf(client, requestId).some((e) => ['round_ready', 'error', 'done'].includes(e.type))

  /** The packaged app's guard (`allowLockedTopics: false`), or the dev build's. */
  const guard =
    (allowLockedTopics = false) =>
    (topicId: number) =>
      createTopicLockGuard({ db, corpus }, { allowLockedTopics })(topicId)
  const assertTopicUnlocked = guard()

  /** A Foundations Module topic before `cache`, not mastered: `cache` is locked until it is. */
  const lockCache = () =>
    createTopic(db, { slug: 'http', title: 'HTTP', position: 0, inFoundationsModule: true })

  const lastEvent = async (ipc: ReturnType<typeof createMasteryIpc>, requestId: string) => {
    const client = new FakeClient()
    ipc.startRound({ requestId, topicId: topic.id }, client)
    await vi.waitFor(() => expect(ended(client, requestId)).toBe(true))
    return eventsOf(client, requestId).at(-1)
  }

  it('refuses a Round on a locked topic outside dev builds, with a typed error', async () => {
    lockCache()
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked
    })

    expect(await lastEvent(ipc, 'r1')).toMatchObject({
      type: 'error',
      error: { code: 'topic_locked', message: expect.stringMatching(/Master HTTP first/) }
    })
    const client = new FakeClient()
    ipc.startRemediation(
      { requestId: 'm1', topicId: topic.id, notionId: slugOf('cache-aside').id },
      client
    )
    await vi.waitFor(() => expect(ended(client, 'm1')).toBe(true))
    expect(eventsOf(client, 'm1')).toMatchObject([
      { type: 'error', error: { code: 'topic_locked' } }
    ])
    expect(calls).toEqual([])
  })

  it('lets a dev build start a locked topic', async () => {
    lockCache()
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked: guard(true)
    })
    // Past the lock, the Mastery Loop's own rule applies (the lesson comes first).
    expect(await lastEvent(ipc, 'r1')).toMatchObject({
      type: 'error',
      error: { code: 'unknown', message: 'Read the lesson before the first quiz.' }
    })
  })

  it('never locks a topic that already has progress', async () => {
    lockCache()
    readLesson()
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked
    })
    expect(await lastEvent(ipc, 'r1')).toMatchObject({ type: 'round_ready' })
  })

  it('starts a round without sending the quiz content, then streams a Remediation Lesson', async () => {
    readLesson()
    const client = new FakeClient()
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked
    })

    ipc.startRound({ requestId: 'r1', topicId: topic.id }, client)
    await vi.waitFor(() => expect(ended(client, 'r1')).toBe(true))
    const roundEvents = eventsOf(client, 'r1')
    expect(roundEvents.map((e) => e.type)).toEqual(['queued', 'started', 'round_ready'])
    const ready = roundEvents.at(-1) as Extract<MasteryEvent, { type: 'round_ready' }>
    play(ready.start, ['cache-aside'])

    ipc.startRemediation(
      { requestId: 'm1', topicId: topic.id, notionId: slugOf('cache-aside').id },
      client
    )
    await vi.waitFor(() => expect(ended(client, 'm1')).toBe(true))
    expect(eventsOf(client, 'm1').map((e) => e.type)).toEqual([
      'prepared',
      'queued',
      'started',
      'text_delta',
      'done'
    ])
    expect(eventsOf(client, 'm1')[0]).toMatchObject({
      grounded: true,
      notions: [{ slug: 'cache-aside' }]
    })
    const state = ipc.getState({ topicId: topic.id })
    expect(state.step).toMatchObject({ name: 'remediation', targets: [{ ready: true }] })
    // The next quiz was pre-generated while the Remediation Lesson was read.
    await vi.waitFor(() => expect(callsOf('quiz')).toHaveLength(2))
    const next = await mastery.nextQuizRequest(topic.id)
    await vi.waitFor(() =>
      expect(
        getCachedContent(db, contentCacheKey('quiz', next.input, QUIZ_PROMPT_VERSION, 'fr'))
      ).toBeDefined()
    )
    ipc.startRound({ requestId: 'r2', topicId: topic.id }, client)
    await vi.waitFor(() => expect(ended(client, 'r2')).toBe(true))
    expect(eventsOf(client, 'r2').map((e) => e.type)).toEqual(['round_ready'])
    expect(callsOf('quiz')).toHaveLength(2)
  })

  it('ends with a typed error when the CLI fails', async () => {
    readLesson()
    loggedOut = true
    const client = new FakeClient()
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked
    })

    ipc.startRound({ requestId: 'r1', topicId: topic.id }, client)
    await vi.waitFor(() => expect(ended(client, 'r1')).toBe(true))
    expect(eventsOf(client, 'r1').at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'not_logged_in' }
    })
    expect(listRoundsByTopic(db, topic.id)).toEqual([])
  })

  it('validates requests and refuses unknown topics', () => {
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked
    })
    expect(() => ipc.getState({ topicId: -1 })).toThrow()
    expect(() => ipc.getState({ topicId: 999 })).toThrow(/does not exist/)
    expect(() =>
      ipc.choose({ topicId: topic.id, choice: 'restart' as unknown as 'skip' })
    ).toThrow()
    expect(ipc.listTopics()).toMatchObject([{ slug: 'cache', mastery: 'not_started' }])
  })
})

describe('Declared Mastery', () => {
  const attemptCount = () =>
    db.prepare('SELECT COUNT(*) AS n FROM attempts').get<{ n: number }>()!.n

  it('declares a topic mastered without inventing a round, an attempt or a score', () => {
    const state = mastery.declare(topic.id)
    expect(state).toMatchObject({
      status: 'mastered',
      declared: true,
      canDeclare: false,
      canUndoDeclaration: true,
      failedRounds: 0,
      lastRound: null,
      step: { name: 'lesson', lessonReady: false }
    })
    expect(getTopicMastery(db, topic.id)).toBe('mastered')
    expect(mastery.listTopics()).toMatchObject([
      { slug: 'cache', mastery: 'mastered', declared: true, canUndoDeclaration: true }
    ])
    expect(listRoundsByTopic(db, topic.id)).toEqual([])
    expect(attemptCount()).toBe(0)
    expect(latestNotionScores(db, topic.id)).toEqual([])
  })

  it('is a no-op on a topic already declared or mastered by a Round', async () => {
    mastery.declare(topic.id)
    const row = () => db.prepare('SELECT * FROM declared_masteries').all()
    const first = row()
    expect(mastery.declare(topic.id)).toMatchObject({ declared: true })
    expect(row()).toEqual(first)

    mastery.undoDeclaration(topic.id)
    readLesson()
    play(await mastery.startRound(topic.id))
    expect(mastery.declare(topic.id)).toMatchObject({ status: 'mastered', declared: false })
    expect(row()).toEqual([])
  })

  it('is tested with the normal quiz: scores are recorded, a failure does not revoke it', async () => {
    mastery.declare(topic.id)
    readLesson()
    // "Test me" reuses the normal start: the lesson comes first, then a round.
    const start = await mastery.startRound(topic.id)
    expect(start.round.number).toBe(1)
    expect(mastery.getState(topic.id)).toMatchObject({ status: 'mastered', declared: true })

    expect(play(start, ['cache-aside']).round.passed).toBe(false)
    const failed = mastery.getState(topic.id)
    expect(failed).toMatchObject({ status: 'mastered', declared: true, failedRounds: 1 })
    expect(failed.step.name).toBe('remediation')
    // The scores of the round show in the notion scores like any round.
    expect(latestNotionScores(db, topic.id).find((n) => n.slug === 'cache-aside')).toMatchObject({
      roundNumber: 1,
      scorePercent: 0
    })

    // A passed round makes it a mastery earned by playing.
    await readRemediations()
    play(await mastery.startRound(topic.id))
    expect(mastery.getState(topic.id)).toMatchObject({
      status: 'mastered',
      declared: false,
      step: { name: 'mastered' }
    })
  })

  it('replaces the Round Limit and skipped states', async () => {
    updateSettings(db, { roundLimit: 1 })
    readLesson()
    play(await mastery.startRound(topic.id), ['cache-aside'])
    expect(mastery.getState(topic.id).status).toBe('limit_reached')
    expect(mastery.declare(topic.id)).toMatchObject({ status: 'mastered', declared: true })
    expect(mastery.listTopics()[0]).toMatchObject({ mastery: 'mastered', declared: true })
  })

  it('is undone while no Round was played after it, and refused afterwards', async () => {
    mastery.declare(topic.id)
    expect(mastery.undoDeclaration(topic.id)).toMatchObject({
      status: 'not_started',
      declared: false,
      canDeclare: true
    })
    // Nothing to undo: a no-op.
    expect(mastery.undoDeclaration(topic.id)).toMatchObject({ declared: false })

    mastery.declare(topic.id)
    readLesson()
    await mastery.startRound(topic.id)
    expect(() => mastery.undoDeclaration(topic.id)).toThrow(/Round was played after/)
    expect(mastery.getState(topic.id)).toMatchObject({
      status: 'mastered',
      declared: true,
      canUndoDeclaration: false
    })
  })

  it('goes through IPC: validated, refused on a locked topic, undone', () => {
    const ipc = createMasteryIpc({ db, corpus, service: generation }, mastery, {
      assertTopicUnlocked: (topicId) =>
        createTopicLockGuard(
          { db, corpus },
          {
            allowLockedTopics: false
          }
        )(topicId)
    })
    expect(() => ipc.declare({ topicId: -1 })).toThrow()
    expect(() => ipc.declare({ topicId: 999 })).toThrow(/does not exist/)
    expect(() => ipc.undoDeclaration({} as never)).toThrow()

    // A Foundations Module topic before `cache`, not mastered, locks it.
    createTopic(db, { slug: 'http', title: 'HTTP', position: 0, inFoundationsModule: true })
    expect(() => ipc.declare({ topicId: topic.id })).toThrow(/locked/)
    expect(mastery.getState(topic.id).declared).toBe(false)
    const http = mastery.listTopics().find((t) => t.slug === 'http')!
    expect(ipc.declare({ topicId: http.id })).toMatchObject({ status: 'mastered', declared: true })
    // Declaring the previous topic unlocks `cache`, which can now be declared in turn.
    expect(ipc.declare({ topicId: topic.id })).toMatchObject({ declared: true })
    expect(ipc.undoDeclaration({ topicId: topic.id })).toMatchObject({ declared: false })
  })
})

describe('Generation Language', () => {
  const languageOf = (call: CliCallOptions): GenerationLanguage | undefined =>
    generationLanguages.find((language) => call.systemPrompt.includes(languageRules(language)))
  const languagesOf = (kind: ReturnType<typeof kindOf>) => callsOf(kind).map(languageOf)
  const setLanguage = (generationLanguage: GenerationLanguage) =>
    updateSettings(db, { generationLanguage })
  const sha = (text: string) => createHash('sha256').update(text).digest('hex')

  /** Runs `lesson:start` like the app does and resolves when its quiz Pre-generation was made. */
  async function startLesson(requestId: string, quizEntries: number): Promise<string[]> {
    const events: string[] = []
    const client = Object.assign(new EventEmitter(), {
      send: (_channel: string, payload: { event: { type: string } }) =>
        events.push(payload.event.type),
      isDestroyed: () => false
    }) as unknown as GenerationClient
    createLessonIpc({ db, corpus, service: generation }).start(
      { requestId, topicId: topic.id },
      client
    )
    await vi.waitFor(() => expect(events).toContain('done'))
    // The quiz Pre-generation runs in the background: wait for its entry in the Content Cache.
    await vi.waitFor(() => {
      const quizzes = db
        .prepare("SELECT COUNT(*) AS n FROM content_cache WHERE kind = 'quiz'")
        .get<{ n: number }>()!
      expect(quizzes.n).toBe(quizEntries)
    })
    return events
  }

  const lessons = () =>
    db
      .prepare('SELECT language, content_cache_key AS key FROM lessons ORDER BY id')
      .all<{ language: string; key: string }>()

  it('generates a lesson and its quiz in each language, and reuses the first ones when switching back', async () => {
    await startLesson('fr-1', 1)
    expect(languagesOf('lesson')).toEqual(['fr'])
    expect(languagesOf('quiz')).toEqual(['fr'])

    setLanguage('en')
    await startLesson('en-1', 2)
    expect(languagesOf('lesson')).toEqual(['fr', 'en'])
    expect(languagesOf('quiz')).toEqual(['fr', 'en'])
    expect(lessons().map((l) => l.language)).toEqual(['fr', 'en'])

    setLanguage('fr')
    const events = await startLesson('fr-2', 2)
    expect(events).toContain('done')
    // Both served from the Content Cache: nothing generated, nothing recorded twice.
    expect(callsOf('lesson')).toHaveLength(2)
    expect(callsOf('quiz')).toHaveLength(2)
    expect(lessons().map((l) => l.language)).toEqual(['fr', 'en'])

    const start = await mastery.startRound(topic.id)
    expect(callsOf('quiz')).toHaveLength(2)
    expect(getQuiz(db, start.quiz.id)).toMatchObject({ language: 'fr' })
  })

  it('writes the quiz of the first round from the lesson in the language selected', async () => {
    await startLesson('fr-1', 1)
    setLanguage('en')
    // Only a French lesson was read: the English quiz is written from it.
    expect((await mastery.nextQuizRequest(topic.id)).language).toBe('en')
    expect((await mastery.nextQuizRequest(topic.id)).input).toMatchObject({ lesson: sha(LESSON) })

    // Once an English lesson was read too, the English quiz is written from that one.
    const english =
      '# The cache\n\n## Cache-aside\n<!-- notion: cache-aside -->\nText [source: cache]'
    createLesson(db, {
      topicId: topic.id,
      content: english,
      language: 'en',
      grounded: true,
      sourceSections: ['cache']
    })
    expect((await mastery.nextQuizRequest(topic.id)).input).toMatchObject({ lesson: sha(english) })
    setLanguage('fr')
    expect((await mastery.nextQuizRequest(topic.id)).input).toMatchObject({ lesson: sha(LESSON) })
  })

  it('lets a Round in progress finish in the language of its quiz, then follows the setting', async () => {
    readLesson()
    const first = await mastery.startRound(topic.id)
    expect(getQuiz(db, first.quiz.id)).toMatchObject({ language: 'fr' })

    // The learner switches to English in the middle of the round.
    setLanguage('en')
    const resumed = await mastery.startRound(topic.id)
    expect(resumed.quiz.id).toBe(first.quiz.id)
    expect(resumed.round.id).toBe(first.round.id)
    expect(callsOf('quiz')).toHaveLength(1) // nothing was generated

    // The round ends as it started and mastery is computed as ever.
    expect(play(resumed, ['cache-aside']).round.passed).toBe(false)
    expect(mastery.getState(topic.id)).toMatchObject({ status: 'in_progress', roundNumber: 2 })

    // What is generated next is English: the Remediation Lesson, then the next quiz.
    await readRemediations()
    expect(languagesOf('remediation')).toEqual(['en'])
    const second = await mastery.startRound(topic.id)
    expect(languagesOf('quiz')).toEqual(['fr', 'en'])
    expect(getQuiz(db, second.quiz.id)).toMatchObject({ language: 'en' })
    expect(play(second).round.passed).toBe(true)
    expect(getTopicMastery(db, topic.id)).toBe('mastered')
  })

  it('records a Remediation Lesson once per round, notion and language, without changing the loop', async () => {
    readLesson()
    play(await mastery.startRound(topic.id), ['cache-aside'])
    const state = () => mastery.getState(topic.id)
    expect(state().step).toMatchObject({ name: 'remediation' })

    const read = async (language: GenerationLanguage) => {
      setLanguage(language)
      const run = mastery.prepareRemediation(topic.id, slugOf('cache-aside').id)
      const output = await generation.generate(run.request).result
      mastery.recordRemediation(run, output)
      mastery.recordRemediation(run, output) // once only
    }
    await read('fr')
    const afterFrench = state()
    await read('en')

    expect(listRemediationLessonsByTopic(db, topic.id).map(({ language }) => language)).toEqual([
      'fr',
      'en'
    ])
    // The loop only knows that this notion was remediated in this round, not in which language.
    expect(state()).toEqual(afterFrench)
    expect(languagesOf('remediation')).toEqual(['fr', 'en'])
  })

  it('pre-generates the quiz in the language of the lesson being read, even if the setting changes meanwhile', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const gated: CliRunner = async (options) => {
      if (kindOf(options) === 'lesson') await gate
      return runner(options)
    }
    const slow = new GenerationService({ db, runner: gated, resolveCli: async () => '/x/claude' })
    const events: string[] = []
    const client = Object.assign(new EventEmitter(), {
      send: (_channel: string, payload: { event: { type: string } }) =>
        events.push(payload.event.type),
      isDestroyed: () => false
    }) as unknown as GenerationClient
    setLanguage('en')
    createLessonIpc({ db, corpus, service: slow }).start(
      { requestId: 'slow', topicId: topic.id },
      client
    )
    await vi.waitFor(() => expect(events).toContain('prepared'))
    setLanguage('fr') // changed while the English lesson is being written
    release()
    await vi.waitFor(() => expect(callsOf('quiz')).toHaveLength(1))

    expect(languagesOf('lesson')).toEqual(['en'])
    expect(languagesOf('quiz')).toEqual(['en'])
    expect(lessons().map((l) => l.language)).toEqual(['en'])
    slow.dispose()
  })
})
