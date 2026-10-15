// Question Clarification over IPC (#53): outcomes, cancellation, validation. The Generation is run
// by the fake CLI (the real runner, schema included) or by an injected runner when a test needs to
// hold or fail it.
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { listAttemptsByRound } from '../db/repositories/assessment'
import type { CliCallOptions } from '../generation/cliRunner'
import { cliFailure, GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import { GenerationService, type CliRunner } from '../generation/service'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { localGraders } from '../quiz/grading'
import { createQuestionClarifier } from '../quiz/questionClarifier'
import { createQuizService } from '../quiz/service'
import { createQuizIpc } from './quiz'

let db: Database
let generation: GenerationService | undefined

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => {
  generation?.dispose()
  generation = undefined
  db.close()
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

/** The fixture quiz in an open round, clarified through `service`. */
function play(service: GenerationService) {
  const ipc = createQuizIpc(
    db,
    createQuizService(db, localGraders, {
      questionClarifier: createQuestionClarifier(service, db)
    }),
    { allowDevFixture: true }
  )
  const { quizId } = ipc.createDevQuiz()
  const { round, quiz } = ipc.startRound({ quizId })
  return { ipc, round, quiz, questionId: quiz.questions[0]!.id }
}

describe('question clarification over IPC, with the fake CLI', () => {
  let fake: FakeCli

  beforeEach(() => {
    fake = installFakeCli()
    generation = new GenerationService({
      db,
      cli: { env: fake.env, killGraceMs: 200 },
      resolveCli: async () => fake.bin
    })
  })

  afterEach(() => fake.cleanup())

  it('generates once, then reads the Content Cache; "another" generates again', async () => {
    const { ipc, round, quiz, questionId } = play(generation!)
    const request = { roundId: round.id, questionId }

    const first = await ipc.clarifyQuestion(request, fakeClient())
    const second = await ipc.clarifyQuestion(request, fakeClient())
    const third = await ipc.clarifyQuestion({ ...request, another: true }, fakeClient())

    expect(first).toMatchObject({
      status: 'clarified',
      fromCache: false,
      clarification: { rewording: expect.stringContaining('faux CLI'), example: expect.any(String) }
    })
    expect(second).toMatchObject({ status: 'clarified', fromCache: true })
    expect(third).toMatchObject({ status: 'clarified', fromCache: false })
    expect(fake.calls()).toHaveLength(2)
    // The CLI got the question as the learner sees it.
    expect(fake.calls()[0]!.stdin).toContain(quiz.questions[0]!.prompt)
    expect(fake.calls()[0]!.argv).toContain('--json-schema')
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('throws refusals and malformed requests instead of returning an outcome', async () => {
    const { ipc, round, questionId } = play(generation!)

    await expect(
      ipc.clarifyQuestion({ roundId: round.id, questionId: 0 }, fakeClient())
    ).rejects.toThrow()
    await expect(
      ipc.clarifyQuestion({ roundId: round.id, questionId, another: 'yes' } as never, fakeClient())
    ).rejects.toThrow()
    await expect(
      ipc.clarifyQuestion({ roundId: round.id + 100, questionId }, fakeClient())
    ).rejects.toThrow(/does not exist/)
    expect(() => ipc.cancelClarification({ roundId: 0, questionId } as never)).toThrow()
    expect(fake.calls()).toHaveLength(0)
  })
})

describe('question clarification over IPC, with an injected runner', () => {
  let calls: CliCallOptions[]
  let failure: 'not_logged_in' | null
  let hold: boolean

  const runner: CliRunner = (options) =>
    new Promise((resolve, reject) => {
      calls.push(options)
      options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
      if (failure) return reject(cliFailure('Not logged in · Please run /login'))
      if (hold) return
      resolve({
        isError: false,
        subtype: 'success',
        text: '',
        structuredOutput: { rewording: 'Autrement dit...', example: 'Par exemple...' },
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    })

  beforeEach(() => {
    calls = []
    failure = null
    hold = false
    generation = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
  })

  it('returns a typed error as an outcome and stores nothing when the Generation fails', async () => {
    const { ipc, round, questionId } = play(generation!)
    failure = 'not_logged_in'

    const outcome = await ipc.clarifyQuestion({ roundId: round.id, questionId }, fakeClient())

    expect(outcome).toMatchObject({ status: 'failed', error: { code: 'not_logged_in' } })
    expect(db.prepare('SELECT count(*) AS n FROM content_cache').get()).toEqual({ n: 0 })
    // The learner can retry.
    failure = null
    await expect(
      ipc.clarifyQuestion({ roundId: round.id, questionId }, fakeClient())
    ).resolves.toMatchObject({ status: 'clarified' })
  })

  it('cancels a clarification on request, or when the window closes', async () => {
    const { ipc, round, questionId } = play(generation!)
    const client = fakeClient()
    hold = true

    const cancelled = ipc.clarifyQuestion({ roundId: round.id, questionId }, client)
    await expect.poll(() => calls.length).toBe(1)
    ipc.cancelClarification({ roundId: round.id, questionId })
    expect(await cancelled).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })

    const closed = ipc.clarifyQuestion({ roundId: round.id, questionId }, client)
    await expect.poll(() => calls.length).toBe(2)
    client.destroy()
    expect(await closed).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })
    expect(db.prepare('SELECT count(*) AS n FROM content_cache').get()).toEqual({ n: 0 })
  })
})
