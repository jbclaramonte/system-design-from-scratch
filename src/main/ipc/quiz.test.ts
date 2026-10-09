import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { listAttemptsByRound } from '../db/repositories/assessment'
import type { GenerationClient } from '../generation/ipc'
import { GenerationService } from '../generation/service'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { createFreeAnswerGrader } from '../quiz/freeAnswerGrader'
import { localGraders } from '../quiz/grading'
import { createQuizService } from '../quiz/service'
import { createQuizIpc } from './quiz'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

const quizIpc = (allowDevFixture = true) =>
  createQuizIpc(db, createQuizService(db), { allowDevFixture })

describe('createQuizIpc', () => {
  it('plays the dev fixture quiz end to end', () => {
    const ipc = quizIpc()
    const { topicId, quizId } = ipc.createDevQuiz()

    expect(ipc.listQuizzes({ topicId }).map((quiz) => quiz.id)).toEqual([quizId])
    const { round, quiz } = ipc.startRound({ quizId })
    const [single, multiple, scenario] = quiz.questions
    const feedback = ipc.submitAnswer({
      roundId: round.id,
      questionId: single!.id,
      answer: { selected: [0] }
    })
    expect(feedback.result).toBe('incorrect')
    const result = ipc.completeRound({
      roundId: round.id,
      answers: [
        { questionId: multiple!.id, answer: { selected: [0, 1, 3] } },
        { questionId: scenario!.id, answer: { selected: [1] } }
      ]
    })

    expect(result.round).toMatchObject({ number: 1, passed: false })
    expect(result.round.scorePercent).toBeCloseTo(66.667, 3)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(3)
  })

  it('rejects malformed requests before reaching the service', () => {
    const ipc = quizIpc()

    expect(() => ipc.listQuizzes({ topicId: 0 })).toThrow()
    expect(() => ipc.loadQuiz({ quizId: 1.5 })).toThrow()
    expect(() => ipc.startRound({ quizId: -1 })).toThrow()
    expect(() =>
      ipc.submitAnswer({ roundId: 1, questionId: 1, answer: { selected: 'all' } } as never)
    ).toThrow()
    expect(() => ipc.completeRound({ roundId: 1, answers: [{}] } as never)).toThrow()
  })

  it('refuses the dev fixture when not allowed', () => {
    expect(() => quizIpc(false).createDevQuiz()).toThrow(/only available in dev/)
  })
})

describe('free-answer grading over IPC, with the fake CLI', () => {
  let fake: FakeCli
  let generation: GenerationService

  beforeEach(() => {
    fake = installFakeCli()
    generation = new GenerationService({
      db,
      cli: { env: fake.env, killGraceMs: 200 },
      resolveCli: async () => fake.bin
    })
  })

  afterEach(() => {
    generation.dispose()
    fake.cleanup()
  })

  /** A window: `destroy()` closes it. */
  const fakeClient = () => {
    const emitter = new EventEmitter()
    const client: GenerationClient & { destroy(): void } = {
      send: () => {},
      isDestroyed: () => false,
      once: (event, listener) => emitter.once(event, listener),
      removeListener: (event, listener) => emitter.removeListener(event, listener),
      destroy: () => emitter.emit('destroyed')
    }
    return client
  }

  /** The fixture quiz in an open round; the fake CLI picks its scenario from the answer text. */
  function play() {
    const ipc = createQuizIpc(
      db,
      createQuizService(db, localGraders, { freeAnswerGrader: createFreeAnswerGrader(generation) }),
      { allowDevFixture: true }
    )
    const { quizId } = ipc.createDevQuiz()
    const { round, quiz } = ipc.startRound({ quizId })
    const question = quiz.questions.find((q) => q.type === 'free_answer')!
    expect(question.gradable).toBe(true)
    return { ipc, round, quiz, questionId: question.id }
  }

  it('grades a free answer through a Generation and records it', async () => {
    const { ipc, round, quiz, questionId } = play()

    const outcome = await ipc.submitFreeAnswer(
      { roundId: round.id, questionId, answer: { text: 'scenario:grading Le TTL expire.' } },
      fakeClient()
    )

    expect(outcome).toMatchObject({
      status: 'graded',
      feedback: { kind: 'free_answer', result: 'correct', score: 1 }
    })
    expect(fake.calls()).toHaveLength(1)
    expect(fake.calls()[0]!.stdin).toContain('<learner_answer>\nscenario:grading Le TTL expire.')
    const [single, multiple, scenario] = quiz.questions
    const result = ipc.completeRound({
      roundId: round.id,
      answers: [
        { questionId: single!.id, answer: { selected: [1] } },
        { questionId: multiple!.id, answer: { selected: [0, 1, 3] } },
        { questionId: scenario!.id, answer: { selected: [1] } }
      ]
    })
    expect(result.round).toMatchObject({ scorePercent: 100, passed: true })
    expect(result.skippedQuestionIds).toEqual([])
  })

  it('returns a typed error and records nothing when the grading fails', async () => {
    const { ipc, round, questionId } = play()

    const outcome = await ipc.submitFreeAnswer(
      { roundId: round.id, questionId, answer: { text: 'scenario:not-logged-in' } },
      fakeClient()
    )

    expect(outcome).toMatchObject({ status: 'failed', error: { code: 'not_logged_in' } })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('cancels a grading on request, or when the window closes', async () => {
    const { ipc, round, questionId } = play()
    const client = fakeClient()

    const cancelled = ipc.submitFreeAnswer(
      { roundId: round.id, questionId, answer: { text: 'scenario:slow' } },
      client
    )
    await expect.poll(() => fake.calls().length).toBe(1)
    ipc.cancelGrading({ roundId: round.id, questionId })
    expect(await cancelled).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })

    const closed = ipc.submitFreeAnswer(
      { roundId: round.id, questionId, answer: { text: 'scenario:slow encore' } },
      client
    )
    await expect.poll(() => fake.calls().length).toBe(2)
    client.destroy()
    expect(await closed).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('throws refusals and malformed requests instead of returning an outcome', async () => {
    const { ipc, round, questionId } = play()

    await expect(
      ipc.submitFreeAnswer({ roundId: round.id, questionId, answer: { text: '' } }, fakeClient())
    ).rejects.toThrow(/Write an answer first/)
    await expect(
      ipc.submitFreeAnswer({ roundId: round.id, questionId, answer: 'x' } as never, fakeClient())
    ).rejects.toThrow()
    await expect(
      ipc.contestGrade({ roundId: round.id, questionId, justification: 'Relis.' }, fakeClient())
    ).rejects.toThrow(/no graded free answer/)
    expect(() => ipc.cancelGrading({ roundId: 0, questionId } as never)).toThrow()
    expect(fake.calls()).toHaveLength(0)
  })
})
