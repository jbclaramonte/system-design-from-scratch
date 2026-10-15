// Question Clarification (#53) end to end in the main process: the quiz service, the clarifier and
// a real GenerationService with an injected CLI runner. The guard tests prove the prompt never
// carries an answer key; the others cover the cache, "Reformulate differently", the queue and the
// absence of any effect on the Mastery Loop.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QuestionType } from '../../shared/quiz'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { createQuiz } from '../db/repositories/assessment'
import { contentCacheKey, getCachedContent } from '../db/repositories/contentCache'
import { createNotions, createTopic } from '../db/repositories/learningContent'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure, GenerationError } from '../generation/errors'
import {
  buildQuestionClarificationGeneration,
  QUESTION_CLARIFICATION_PROMPT_VERSION,
  type QuestionBrief
} from '../generation/prompts/questionClarification'
import { GenerationService, type CliRunner } from '../generation/service'
import { createFreeAnswerGrader } from './freeAnswerGrader'
import { localGraders } from './grading'
import { createQuestionClarifier } from './questionClarifier'
import { createQuizService, type QuizService } from './service'

const SECRETS = {
  explanation: 'EXPLICATION-SECRETE-7f3a',
  scenarioExplanation: 'JUSTIFICATION-SECRETE-91bc',
  modelAnswer: 'REPONSE-MODELE-SECRETE-44de',
  point: 'POINT-ATTENDU-SECRET-2c8e',
  notion: 'NOTION-TITRE-SECRET-5d1f'
}

let db: Database
let service: GenerationService
let quiz: QuizService
let calls: CliCallOptions[]
/** Set to make clarification calls wait (until their signal aborts or `release`). */
let holdClarification: boolean
let releaseClarification: (() => void) | null
let failClarification: boolean
let version: number

const clarificationOf = (call: CliCallOptions) =>
  call.systemPrompt.includes('did not understand a quiz question')

const runner: CliRunner = (options) =>
  new Promise((resolve, reject) => {
    calls.push(options)
    options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
    const done = (structuredOutput: object) =>
      resolve({
        isError: false,
        subtype: 'success',
        text: '',
        structuredOutput,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    // A held pre-generation: waits for its signal.
    if (options.prompt === 'held') return
    if (clarificationOf(options)) {
      if (failClarification) return reject(cliFailure('Not logged in · Please run /login'))
      const output = {
        rewording: `Reformulation ${++version}`,
        example: `Exemple ${version}`
      }
      if (!holdClarification) return done(output)
      releaseClarification = () => done(output)
      return
    }
    // Free-answer grading of the two-point question.
    done({
      verdict: 'correct',
      expectedPoints: [
        { covered: true, justification: 'ok' },
        { covered: true, justification: 'ok' }
      ],
      misconceptions: [],
      explanation: 'Bien.',
      toReview: []
    })
  })

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  calls = []
  holdClarification = false
  releaseClarification = null
  failClarification = false
  version = 0
  service = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
  quiz = createQuizService(db, localGraders, {
    freeAnswerGrader: createFreeAnswerGrader(service),
    questionClarifier: createQuestionClarifier(service, db)
  })
})

afterEach(() => {
  service.dispose()
  db.close()
})

/** A quiz with one question of each type, every secret in a place the prompt must not read. */
function seed() {
  const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 0 })
  const [notion] = createNotions(db, [
    { topicId: topic.id, slug: 'cache-aside', title: SECRETS.notion }
  ])
  const created = createQuiz(db, {
    topicId: topic.id,
    grounded: true,
    questions: [
      {
        position: 0,
        type: 'single_choice',
        prompt: 'Où se trouve un client cache ?',
        body: {
          choices: [
            { text: 'Sur le serveur de base de données', correct: false },
            { text: 'Dans le navigateur ou le système', correct: true }
          ],
          explanation: SECRETS.explanation,
          sourceSections: []
        },
        notionIds: [notion!.id]
      },
      {
        position: 1,
        type: 'multiple_choice',
        prompt: 'Quelles stratégies écrivent dans le cache ?',
        body: {
          choices: [
            { text: 'Write-through', correct: true },
            { text: 'Cache-aside', correct: false },
            { text: 'Write-behind', correct: true }
          ],
          explanation: SECRETS.explanation,
          sourceSections: []
        },
        notionIds: [notion!.id]
      },
      {
        position: 2,
        type: 'scenario',
        prompt: 'Que choisis-tu ?',
        body: {
          scenario: 'Un site de e-commerce lit beaucoup plus qu’il n’écrit.',
          choices: [
            { text: 'Un cache devant la base', correct: true },
            { text: 'Une base plus petite', correct: false }
          ],
          explanation: SECRETS.scenarioExplanation,
          sourceSections: []
        },
        notionIds: [notion!.id]
      },
      {
        position: 3,
        type: 'free_answer',
        prompt: 'À quoi sert un TTL ?',
        body: {
          expectedPoints: [SECRETS.point, 'Deuxième point'],
          modelAnswer: SECRETS.modelAnswer,
          sourceSections: []
        },
        notionIds: [notion!.id]
      }
    ]
  })
  const questions = quiz.loadQuiz(created.id).questions
  const { round } = quiz.startRound(created.id)
  return {
    topic,
    round,
    questions,
    byType: (type: QuestionType) => questions.find((q) => q.type === type)!
  }
}

const cachedClarifications = () =>
  db
    .prepare(
      "SELECT cache_key AS key, content FROM content_cache WHERE kind = 'question_clarification'"
    )
    .all<{ key: string; content: string }>()

describe('the prompt input never contains an answer key (guard)', () => {
  it('holds for every question type, through the quiz service', async () => {
    const { round, questions } = seed()

    for (const question of questions) {
      await quiz.clarifyQuestion(round.id, question.id)
    }

    expect(calls.filter(clarificationOf)).toHaveLength(4)
    for (const call of calls) {
      const prompt = `${call.systemPrompt}\n${call.prompt}`
      for (const secret of Object.values(SECRETS)) expect(prompt).not.toContain(secret)
      // No stored answer key shape either: no `correct` flag, no rubric field.
      expect(prompt).not.toMatch(/"correct"|expectedPoints|modelAnswer|explanation/)
    }
    // What the learner sees is there: prompt, scenario and the choice texts.
    const all = calls.map((call) => call.prompt).join('\n')
    expect(all).toContain('Où se trouve un client cache ?')
    expect(all).toContain('Dans le navigateur ou le système')
    expect(all).toContain('Un site de e-commerce lit beaucoup plus')
    expect(all).toContain('À quoi sert un TTL ?')
    // A free answer has no choices to list.
    const free = calls.find((call) => call.prompt.includes('À quoi sert un TTL ?'))!
    expect(free.prompt).not.toContain('Choices the learner picks from')
  })

  it('holds for the "Reformulate differently" prompt too, and the cache input holds the id only', async () => {
    const { round, byType } = seed()
    const question = byType('single_choice')
    await quiz.clarifyQuestion(round.id, question.id)
    await quiz.clarifyQuestion(round.id, question.id, { another: true })

    const second = calls.filter(clarificationOf)[1]!
    expect(second.prompt).toContain('<previous_clarification>')
    for (const secret of Object.values(SECRETS)) expect(second.prompt).not.toContain(secret)
    const [entry] = db
      .prepare("SELECT inputs FROM content_cache WHERE kind = 'question_clarification'")
      .all<{ inputs: string }>()
    expect(JSON.parse(entry!.inputs)).toEqual({ questionId: question.id })
  })

  it('cannot be fed more than the brief: extra fields of a stored question are ignored', () => {
    const leaky = {
      questionId: 1,
      type: 'single_choice',
      prompt: 'Question ?',
      scenario: null,
      choices: ['A', 'B'],
      topicTitle: 'Cache',
      // What a careless caller might spread in from a stored question.
      explanation: SECRETS.explanation,
      correct: [1],
      modelAnswer: SECRETS.modelAnswer,
      expectedPoints: [SECRETS.point],
      notions: [SECRETS.notion]
    } as QuestionBrief
    const build = buildQuestionClarificationGeneration(leaky, {
      rewording: 'Avant',
      example: 'Exemple avant'
    })

    const prompt = `${build.prompt.system}\n${build.prompt.user}\n${JSON.stringify(build.input)}`
    for (const secret of Object.values(SECRETS)) expect(prompt).not.toContain(secret)
  })

  it('asks for a plainer French rewording plus one example, and forbids any hint', () => {
    const { system } = buildQuestionClarificationGeneration({
      questionId: 1,
      type: 'single_choice',
      prompt: 'Question ?',
      scenario: null,
      choices: ['A', 'B'],
      topicTitle: 'Cache'
    }).prompt

    expect(system).toContain('simpler words')
    expect(system).toContain('ONE concrete, everyday example')
    expect(system).toContain('Write everything the learner reads in French')
    expect(system).toMatch(
      /Never reveal the correct answer or the correct choice, never hint at it/
    )
    expect(system).toMatch(
      /never say or imply that a choice is wrong, never eliminate or rank choices/
    )
    expect(system).toMatch(/Never teach the answer/)
  })
})

describe('the Content Cache', () => {
  it('reads the stored clarification on the second press, without calling the CLI', async () => {
    const { round, byType } = seed()
    const question = byType('multiple_choice')

    const first = await quiz.clarifyQuestion(round.id, question.id)
    const second = await quiz.clarifyQuestion(round.id, question.id)

    expect(first).toEqual({
      clarification: { rewording: 'Reformulation 1', example: 'Exemple 1' },
      fromCache: false
    })
    expect(second).toEqual({ clarification: first.clarification, fromCache: true })
    expect(calls.filter(clarificationOf)).toHaveLength(1)
    const key = contentCacheKey(
      'question_clarification',
      { questionId: question.id },
      QUESTION_CLARIFICATION_PROMPT_VERSION
    )
    expect(cachedClarifications().map((entry) => entry.key)).toEqual([key])
    expect(getCachedContent(db, key)).toMatchObject({
      kind: 'question_clarification',
      promptVersion: QUESTION_CLARIFICATION_PROMPT_VERSION,
      grounded: false
    })
  })

  it('keeps one entry per Question', async () => {
    const { round, questions } = seed()

    await quiz.clarifyQuestion(round.id, questions[0]!.id)
    await quiz.clarifyQuestion(round.id, questions[1]!.id)

    expect(cachedClarifications()).toHaveLength(2)
    expect(calls.filter(clarificationOf)).toHaveLength(2)
  })

  it('"Reformulate differently" bypasses the cache, asks for a different version and replaces the stored one', async () => {
    const { round, byType } = seed()
    const question = byType('single_choice')
    await quiz.clarifyQuestion(round.id, question.id)

    const other = await quiz.clarifyQuestion(round.id, question.id, { another: true })

    expect(other).toEqual({
      clarification: { rewording: 'Reformulation 2', example: 'Exemple 2' },
      fromCache: false
    })
    const second = calls.filter(clarificationOf)[1]!
    expect(second.prompt).toContain('Reformulation 1')
    expect(second.prompt).toContain('clearly different')
    // The stored entry is now the new one: a plain press reads it, with no further call.
    expect(cachedClarifications()).toHaveLength(1)
    const again = await quiz.clarifyQuestion(round.id, question.id)
    expect(again).toEqual({ clarification: other.clarification, fromCache: true })
    expect(calls.filter(clarificationOf)).toHaveLength(2)
  })

  it('never stores a failed or cancelled run', async () => {
    const { round, byType } = seed()
    const question = byType('single_choice')

    failClarification = true
    await expect(quiz.clarifyQuestion(round.id, question.id)).rejects.toMatchObject({
      code: 'not_logged_in'
    })

    failClarification = false
    holdClarification = true
    const controller = new AbortController()
    const pending = quiz.clarifyQuestion(round.id, question.id, { signal: controller.signal })
    await expect.poll(() => calls.length).toBe(2)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })

    expect(cachedClarifications()).toEqual([])
  })
})

describe('the Mastery Loop is untouched', () => {
  const counts = () =>
    Object.fromEntries(
      ['attempts', 'rounds', 'questions', 'question_notions', 'quizzes', 'notions', 'lessons'].map(
        (table) => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get<{ n: number }>()!.n]
      )
    )

  it('writes no attempt, round, question or notion, and changes no grading', async () => {
    const { round, questions, byType } = seed()
    const before = counts()
    const bodies = db.prepare('SELECT id, body, prompt FROM questions ORDER BY id').all()

    for (const question of questions) {
      await quiz.clarifyQuestion(round.id, question.id)
      await quiz.clarifyQuestion(round.id, question.id, { another: true })
    }

    expect(counts()).toEqual(before)
    expect(db.prepare('SELECT id, body, prompt FROM questions ORDER BY id').all()).toEqual(bodies)
    expect(quiz.startRound(round.quizId).round).toMatchObject({ id: round.id, completedAt: null })

    // Grading is what it would have been: right and wrong answers, and the round score.
    const single = byType('single_choice')
    expect(
      quiz.submitAnswer(round.id, { questionId: single.id, answer: { selected: [1] } })
    ).toMatchObject({ result: 'correct', score: 1 })
    const multiple = byType('multiple_choice')
    expect(
      quiz.submitAnswer(round.id, { questionId: multiple.id, answer: { selected: [1] } })
    ).toMatchObject({ result: 'incorrect', score: 0 })
    const scenario = byType('scenario')
    quiz.submitAnswer(round.id, { questionId: scenario.id, answer: { selected: [0] } })
    await quiz.submitFreeAnswer(round.id, {
      questionId: byType('free_answer').id,
      answer: { text: 'Limiter la durée de vie.' }
    })
    const result = quiz.completeRound(round.id)
    expect(result.round.scorePercent).toBe(75)
    expect(result.notionScores[0]).toMatchObject({ questionCount: 4, earned: 3 })
  })

  it('refuses an answered question, a completed round, a foreign question and a missing clarifier', async () => {
    const { round, byType } = seed()
    const single = byType('single_choice')
    quiz.submitAnswer(round.id, { questionId: single.id, answer: { selected: [1] } })

    await expect(quiz.clarifyQuestion(round.id, single.id)).rejects.toThrow(/already answered/)
    await expect(quiz.clarifyQuestion(round.id, 9999)).rejects.toThrow(/not part of round/)
    await expect(quiz.clarifyQuestion(9999, single.id)).rejects.toThrow(/does not exist/)
    await expect(
      createQuizService(db).clarifyQuestion(round.id, byType('scenario').id)
    ).rejects.toThrow(/not available/)
    expect(calls).toHaveLength(0)
  })
})

describe('the Generation queue', () => {
  it('does not block a grading while a clarification waits for its slot or runs', async () => {
    const { round, byType } = seed()
    holdClarification = true
    const clarifying = quiz.clarifyQuestion(round.id, byType('single_choice').id)
    await expect.poll(() => calls.length).toBe(1)

    // The clarification is running and held; a free answer is still graded at once.
    const graded = await quiz.submitFreeAnswer(round.id, {
      questionId: byType('free_answer').id,
      answer: { text: 'Une durée de vie.' }
    })
    expect(graded).toMatchObject({ kind: 'free_answer', result: 'correct' })

    releaseClarification?.()
    await expect(clarifying).resolves.toMatchObject({ fromCache: false })
  })

  it('runs as a background Generation, so a foreground request always finds a slot', async () => {
    const { round, byType } = seed()
    // The background slot (concurrency 2, one background at most) is taken by a held pre-generation.
    const hold = service.pregenerate({
      kind: 'lesson',
      input: { held: true },
      prompt: { version: 'held-1', system: 'held system', user: 'held' }
    })
    await expect.poll(() => calls.length).toBe(1)

    const clarifying = quiz.clarifyQuestion(round.id, byType('single_choice').id)
    // Queued behind the held background job: not started.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls.filter(clarificationOf)).toHaveLength(0)

    const graded = await quiz.submitFreeAnswer(round.id, {
      questionId: byType('free_answer').id,
      answer: { text: 'Une durée de vie.' }
    })
    expect(graded).toMatchObject({ result: 'correct' })

    hold.cancel()
    await expect(clarifying).resolves.toMatchObject({ fromCache: false })
    await hold.result.catch(() => {})
  })
})
