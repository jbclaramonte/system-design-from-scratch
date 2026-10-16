import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activeStepsFor } from '../../shared/protocol'
import type { LearningPath } from '../../shared/learningPath'
import { seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { completeRound, createQuiz, createRound } from '../db/repositories/assessment'
import {
  createProtocolStepSubmission,
  listDesignExercises
} from '../db/repositories/designPractice'
import { listForcedUnlocks } from '../db/repositories/forcedUnlocks'
import { createLesson, getTopicBySlug } from '../db/repositories/learningContent'
import { GenerationService } from '../generation/service'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { seedDesignExercises } from '../protocol/designExercises'
import { createProtocolIpc } from '../protocol/protocolIpc'
import { createProtocolService } from '../protocol/service'
import { createExerciseLockGuard, createTopicLockGuard } from './lock'
import { createLearningPathIpc } from './pathIpc'

const corpus = loadCorpus(corpusPath(process.cwd()))

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  seedTopics(db, corpus, [
    { slug: 'client-server', title: 'Client and server' },
    { slug: 'http', title: 'HTTP' }
  ])
  seedDesignExercises(db, corpus)
})

afterEach(() => db.close())

const deps = () => ({ db, corpus })
const stepOf = (path: LearningPath, key: string) => path.steps.find((step) => step.key === key)!
const idOf = (slug: string) => listDesignExercises(db).find((e) => e.slug === slug)!.id
const topicId = (slug: string) => getTopicBySlug(db, slug)!.id

describe('Forced Unlock: topics', () => {
  it('opens one locked topic for the main-process guard, without credit or progress', () => {
    const ipc = createLearningPathIpc(deps())
    const guard = createTopicLockGuard(deps(), { allowLockedTopics: false })
    const before = ipc.get()
    expect(stepOf(before, 'topic:http').status).toBe('locked')
    expect(() => guard(topicId('http'))).toThrow(/is locked/)

    const path = ipc.forceUnlock({ stepKey: 'topic:http' })
    expect(stepOf(path, 'topic:http')).toMatchObject({
      status: 'available',
      forcedUnlock: true,
      lockedBy: { slug: 'client-server' }
    })
    expect(() => guard(topicId('http'))).not.toThrow()
    // Nothing else changes: the next topic stays locked, the counters and the recommended step too.
    expect(path.steps[2]).toMatchObject({ kind: 'topic', status: 'locked', forcedUnlock: false })
    expect(path.progress).toEqual(before.progress)
    expect(path.nextStepKey).toBe(before.nextStepKey)
  })

  it('is stored, so it survives a restart of the app', () => {
    createLearningPathIpc(deps()).forceUnlock({ stepKey: 'topic:http' })
    expect(listForcedUnlocks(db)).toEqual(['topic:http'])
    // A new instance (a restart) reads it from the database.
    expect(stepOf(createLearningPathIpc(deps()).get(), 'topic:http').forcedUnlock).toBe(true)
  })

  it('locks again while the step has no progress, and refuses once it has some', () => {
    const ipc = createLearningPathIpc(deps())
    ipc.forceUnlock({ stepKey: 'topic:http' })
    const again = ipc.lockAgain({ stepKey: 'topic:http' })
    expect(stepOf(again, 'topic:http')).toMatchObject({ status: 'locked', forcedUnlock: false })
    expect(listForcedUnlocks(db)).toEqual([])

    ipc.forceUnlock({ stepKey: 'topic:http' })
    createLesson(db, { topicId: topicId('http'), content: '# Leçon', grounded: false })
    expect(() => ipc.lockAgain({ stepKey: 'topic:http' })).toThrow(/already has progress/)
    expect(stepOf(ipc.get(), 'topic:http')).toMatchObject({
      status: 'in_progress',
      forcedUnlock: true
    })
  })

  it('stops flagging the step once the previous topic is mastered', () => {
    const ipc = createLearningPathIpc(deps())
    ipc.forceUnlock({ stepKey: 'topic:http' })
    const quiz = createQuiz(db, {
      topicId: topicId('client-server'),
      grounded: false,
      questions: []
    })
    const round = createRound(db, {
      topicId: topicId('client-server'),
      quizId: quiz.id,
      number: 1
    })
    completeRound(db, round.id, { scorePercent: 100, passed: true })
    expect(stepOf(ipc.get(), 'topic:http')).toMatchObject({
      status: 'available',
      forcedUnlock: false,
      lockedBy: null
    })
  })

  it('leaves a step that is not locked as it is, and is idempotent', () => {
    const ipc = createLearningPathIpc(deps())
    ipc.forceUnlock({ stepKey: 'topic:client-server' })
    expect(listForcedUnlocks(db)).toEqual([])
    ipc.forceUnlock({ stepKey: 'topic:http' })
    ipc.forceUnlock({ stepKey: 'topic:http' })
    expect(listForcedUnlocks(db)).toEqual(['topic:http'])
    // Locking again a step without a Forced Unlock does nothing.
    ipc.lockAgain({ stepKey: 'topic:client-server' })
  })

  it('validates the request, and refuses an unknown step or an exercise coming soon', () => {
    // Only Pastebin implemented: the other exercises are coming soon.
    const ipc = createLearningPathIpc({ ...deps(), implementedExercises: ['pastebin'] })
    expect(() => ipc.forceUnlock({ stepKey: 'nonsense' })).toThrow()
    expect(() => ipc.forceUnlock({ stepKey: 'topic:' })).toThrow()
    expect(() => ipc.forceUnlock({ stepKey: 'topic:a b' })).toThrow()
    expect(() => ipc.lockAgain({} as never)).toThrow()
    expect(() => ipc.forceUnlock({ stepKey: 'topic:no-such-topic' })).toThrow(/no step/)
    expect(() => ipc.forceUnlock({ stepKey: 'design_exercise:mint' })).toThrow(/not available yet/)
    expect(listForcedUnlocks(db)).toEqual([])
  })
})

describe('Forced Unlock: Design Exercises and Protocol Steps', () => {
  let fake: FakeCli
  let generation: GenerationService

  beforeEach(() => {
    fake = installFakeCli()
    generation = new GenerationService({
      db,
      cli: { env: fake.env },
      resolveCli: async () => fake.bin
    })
  })

  afterEach(() => {
    generation.dispose()
    fake.cleanup()
  })

  it('refuses a locked exercise until it is force-unlocked, then plays every active step', async () => {
    const ipc = createLearningPathIpc(deps())
    const protocolDeps = { db, corpus, service: generation }
    const protocol = createProtocolIpc(protocolDeps, createProtocolService(protocolDeps), {
      allowDevFixture: false,
      assertExerciseUnlocked: createExerciseLockGuard(deps(), { allowLockedExercises: false })
    })
    const twitter = idOf('twitter')
    const client = Object.assign(new EventEmitter(), {
      send: () => undefined,
      isDestroyed: () => false
    })
    expect(() => protocol.getExercise({ designExerciseId: twitter })).toThrow(/is locked/)
    await expect(
      protocol.submitStep(
        {
          requestId: 'a',
          designExerciseId: twitter,
          step: 'estimations',
          submission: { type: 'text', text: 'x' }
        },
        client
      )
    ).rejects.toThrow(/is locked/)
    expect(fake.calls()).toHaveLength(0)

    const before = ipc.get()
    const path = ipc.forceUnlock({ stepKey: 'design_exercise:twitter' })
    expect(stepOf(path, 'design_exercise:twitter')).toMatchObject({
      status: 'available',
      forcedUnlock: true
    })
    expect(path.progress).toEqual(before.progress)
    // Pastebin, which Twitter waits for, is still locked: the unlock opens one step only.
    expect(stepOf(path, 'design_exercise:pastebin').status).toBe('locked')

    // Protocol Steps unlock by exercise index, so every step active at Twitter's position is
    // playable at once, with no earlier submission.
    const view = protocol.getExercise({ designExerciseId: twitter })
    const active = view.steps.filter((step) => step.active).map((step) => step.step)
    expect(active).toEqual(activeStepsFor(view.exerciseIndex))
    expect(active).toContain('estimations')
    const outcome = await protocol.submitStep(
      {
        requestId: 'b',
        designExerciseId: twitter,
        step: 'estimations',
        submission: { type: 'text', text: '- 100M users scenario:design' }
      },
      client
    )
    expect(outcome.status).toBe('done')
    expect(stepOf(ipc.get(), 'design_exercise:twitter').status).toBe('in_progress')
  })

  it('refuses to lock an exercise again once a step was submitted', () => {
    const ipc = createLearningPathIpc(deps())
    ipc.forceUnlock({ stepKey: 'design_exercise:twitter' })
    createProtocolStepSubmission(db, {
      designExerciseId: idOf('twitter'),
      protocolStep: 'estimations',
      content: { type: 'text', text: 'x' }
    })
    expect(() => ipc.lockAgain({ stepKey: 'design_exercise:twitter' })).toThrow(
      /already has progress/
    )
    expect(listForcedUnlocks(db)).toEqual(['design_exercise:twitter'])
  })
})
