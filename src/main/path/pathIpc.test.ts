import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LearningPath, TopicStep } from '../../shared/learningPath'
import { NON_TEACHABLE_CORPUS_TOPIC_IDS, seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { completeRound, createQuiz, createRound } from '../db/repositories/assessment'
import { createTopic, getTopicBySlug } from '../db/repositories/learningContent'
import { setRoundLimitChoice } from '../db/repositories/mastery'
import { updateSettings } from '../db/repositories/settings'
import { DESIGN_EXERCISE_PREREQUISITES } from './designExercisePrerequisites'
import { createLearningPathIpc, getLearningPath } from './pathIpc'

const corpus = loadCorpus(corpusPath(process.cwd()))
const teachable = corpus
  .listTopics()
  .map((topic) => topic.id)
  .filter((id) => !NON_TEACHABLE_CORPUS_TOPIC_IDS.includes(id))

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  seedTopics(db, corpus, [
    { slug: 'client-server', title: 'Client and server' },
    { slug: 'http', title: 'HTTP' }
  ])
})

afterEach(() => db.close())

/** Plays a completed round on the topic. */
function playRound(slug: string, passed: boolean, number: number) {
  const topic = getTopicBySlug(db, slug)!
  const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
  const round = createRound(db, { topicId: topic.id, quizId: quiz.id, number })
  return completeRound(db, round.id, { scorePercent: passed ? 100 : 50, passed })
}

const statusOf = (path: LearningPath, slug: string) =>
  path.steps.find((step) => step.kind === 'topic' && step.topic.slug === slug)?.status

describe('getLearningPath', () => {
  it('lists the Foundations Module, the teachable primer topics, then one slot per Reference Solution', () => {
    const path = getLearningPath({ db, corpus })
    const topics = path.steps.filter((step): step is TopicStep => step.kind === 'topic')
    expect(topics.map((step) => step.topic.slug)).toEqual(['client-server', 'http', ...teachable])
    const exercises = path.steps.filter((step) => step.kind === 'design_exercise')
    expect(exercises.map((step) => step.status)).toEqual(
      corpus.listReferenceSolutions().map(() => 'coming_soon')
    )
    expect(path.nextStepKey).toBe('topic:client-server')
    expect(statusOf(path, 'http')).toBe('locked')
  })

  it('leaves out topics outside the path (the dev fixture topic)', () => {
    createTopic(db, { slug: 'dev-cache', title: 'Cache (dev fixture)', position: 9999 })
    const path = getLearningPath({ db, corpus })
    expect(path.steps.some((step) => step.key === 'topic:dev-cache')).toBe(false)
  })

  it('unlocks the next topic after a passed round, and not after a skip', () => {
    playRound('client-server', true, 1)
    expect(statusOf(getLearningPath({ db, corpus }), 'http')).toBe('available')

    playRound('http', false, 1)
    playRound('http', false, 2)
    const last = playRound('http', false, 3)
    expect(statusOf(getLearningPath({ db, corpus }), 'http')).toBe('limit_reached')
    setRoundLimitChoice(db, last.id, 'skip')
    const path = getLearningPath({ db, corpus })
    expect(statusOf(path, 'http')).toBe('skipped')
    expect(statusOf(path, teachable[0]!)).toBe('locked')
    expect(path.nextStepKey).toBe('topic:http')
  })

  it('keeps a topic mastered after a later failed round and after a threshold change', () => {
    playRound('client-server', true, 1)
    playRound('client-server', false, 2)
    updateSettings(db, { masteryThreshold: 50 })
    const path = getLearningPath({ db, corpus })
    expect(statusOf(path, 'client-server')).toBe('mastered')
    expect(statusOf(path, 'http')).toBe('available')
    expect(path.progress.masteredTopics).toBe(1)
  })

  it('unlocks an implemented Design Exercise once its prerequisites are mastered', () => {
    const pastebin = DESIGN_EXERCISE_PREREQUISITES.find(
      (e) => e.referenceSolutionId === 'pastebin'
    )!
    pastebin.prerequisites.forEach((slug) => playRound(slug, true, 1))
    const path = getLearningPath({ db, corpus, implementedExercises: ['pastebin'] })
    const step = path.steps.find((s) => s.key === 'design_exercise:pastebin')!
    expect(step.status).toBe('available')
    expect(step.kind === 'design_exercise' && step.title).toBe('Design Pastebin.com (or Bit.ly)')
  })
})

describe('Design Exercise prerequisites', () => {
  it('has one entry per Reference Solution, referencing teachable primer topics only', () => {
    expect(DESIGN_EXERCISE_PREREQUISITES.map((e) => e.referenceSolutionId).sort()).toEqual(
      corpus
        .listReferenceSolutions()
        .map((solution) => solution.id)
        .sort()
    )
    for (const exercise of DESIGN_EXERCISE_PREREQUISITES) {
      expect(exercise.prerequisites.length).toBeGreaterThan(0)
      for (const slug of exercise.prerequisites) expect(teachable).toContain(slug)
    }
  })
})

describe('createLearningPathIpc', () => {
  it('returns the path and pushes it on path:changed', () => {
    const ipc = createLearningPathIpc({ db, corpus })
    expect(ipc.get().nextStepKey).toBe('topic:client-server')

    const sent: { channel: string; payload: LearningPath }[] = []
    const target = {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) =>
        sent.push({ channel, payload: payload as LearningPath })
    }
    playRound('client-server', true, 1)
    ipc.notifyChanged(target)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.channel).toBe('path:changed')
    expect(sent[0]!.payload.nextStepKey).toBe('topic:http')

    ipc.notifyChanged({ ...target, isDestroyed: () => true })
    expect(sent).toHaveLength(1)
  })
})
