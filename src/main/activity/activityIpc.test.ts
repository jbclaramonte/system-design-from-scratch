import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { completeRound, createQuiz, createRound } from '../db/repositories/assessment'
import {
  createDesignExercise,
  createProtocolStepSubmission,
  settleProtocolStepSubmission
} from '../db/repositories/designPractice'
import { addForcedUnlock } from '../db/repositories/forcedUnlocks'
import { getTopicBySlug } from '../db/repositories/learningContent'
import { declareMastery } from '../db/repositories/mastery'
import { updateSettings } from '../db/repositories/settings'
import { dayOfInZone } from './activity'
import { createActivityIpc } from './activityIpc'

const corpus = loadCorpus(corpusPath(process.cwd()))

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

// Wednesday 21 October 2026, noon in Paris (UTC+2).
const NOW = Date.parse('2026-10-21T10:00:00.000Z')
const ipc = () => createActivityIpc(db, { now: () => NOW, dayOf: dayOfInZone('Europe/Paris') })

let roundNumber = 0
/** A round completed at `completedAt` (rounds are dated by `completed_at`). */
function completedRound(completedAt: string) {
  const topic = getTopicBySlug(db, 'client-server')!
  const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
  const round = createRound(db, { topicId: topic.id, quizId: quiz.id, number: ++roundNumber })
  completeRound(db, round.id, { scorePercent: 100, passed: true })
  db.prepare('UPDATE rounds SET completed_at = $completedAt WHERE id = $id').run({
    id: round.id,
    completedAt
  })
}

/** A Protocol Step submission reviewed at `reviewedAt`. */
function reviewedStep(reviewedAt: string, status: 'reviewed' | 'failed' | 'pending' = 'reviewed') {
  const exercise =
    db.prepare('SELECT id FROM design_exercises LIMIT 1').get<{ id: number }>() ??
    createDesignExercise(db, {
      slug: 'url-shortener',
      title: 'URL shortener',
      position: 1,
      grounded: false
    })
  const submission = createProtocolStepSubmission(db, {
    designExerciseId: exercise.id,
    protocolStep: 'functional_requirements',
    content: { type: 'text', text: 'Shorten a URL.' }
  })
  if (status !== 'pending') settleProtocolStepSubmission(db, submission.id, { status })
  db.prepare('UPDATE protocol_step_submissions SET updated_at = $reviewedAt WHERE id = $id').run({
    id: submission.id,
    reviewedAt
  })
}

describe('createActivityIpc', () => {
  it('shows a fresh install: no streak, a goal of 1 Round, nothing done', () => {
    const summary = ipc().get()
    expect(summary.today).toBe('2026-10-21')
    expect(summary.hasActivity).toBe(false)
    expect(summary.streak.current).toBe(0)
    expect(summary.goal).toEqual({ roundsPerDay: 1, roundsToday: 0, met: false })
    expect(summary.week).toHaveLength(7)
  })

  it('derives the streak from completed Rounds already stored (no migration, past counts)', () => {
    completedRound('2026-10-19T09:00:00.000Z')
    completedRound('2026-10-20T09:00:00.000Z')
    completedRound('2026-10-21T08:00:00.000Z')
    const summary = ipc().get()
    expect(summary.streak).toMatchObject({ current: 3, todayDone: true })
    expect(summary.goal).toMatchObject({ roundsToday: 1, met: true })
  })

  it('reads the local day of Paris, not the UTC day, and ignores open Rounds', () => {
    // 22:30 UTC on the 20th is 00:30 on the 21st in Paris.
    completedRound('2026-10-20T22:30:00.000Z')
    const topic = getTopicBySlug(db, 'http')!
    const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
    createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    const summary = ipc().get()
    expect(summary.streak).toMatchObject({ current: 1, todayDone: true })
    expect(summary.goal.roundsToday).toBe(1)
  })

  it('counts a reviewed Protocol Step as an Activity Day, not a failed or pending one', () => {
    reviewedStep('2026-10-20T09:00:00.000Z', 'failed')
    reviewedStep('2026-10-20T09:30:00.000Z', 'pending')
    expect(ipc().get().streak.current).toBe(0)
    reviewedStep('2026-10-20T10:00:00.000Z')
    const summary = ipc().get()
    expect(summary.streak).toMatchObject({ current: 1, todayDone: false })
    expect(summary.goal.roundsToday).toBe(0)
  })

  it('adds nothing for a Declared Mastery or a Forced Unlock', () => {
    const before = ipc().get()
    declareMastery(db, getTopicBySlug(db, 'client-server')!.id)
    addForcedUnlock(db, 'topic:http')
    addForcedUnlock(db, 'design_exercise:url-shortener')
    expect(ipc().get()).toEqual(before)
    expect(before.streak.current).toBe(0)
    // And they do not add to an existing history either.
    completedRound('2026-10-20T09:00:00.000Z')
    const withRound = ipc().get()
    expect(withRound.streak.current).toBe(1)
    expect(withRound.week.filter((day) => day.active)).toHaveLength(1)
  })

  it('follows the dailyGoalRounds setting', () => {
    completedRound('2026-10-21T08:00:00.000Z')
    expect(ipc().get().goal).toEqual({ roundsPerDay: 1, roundsToday: 1, met: true })
    updateSettings(db, { dailyGoalRounds: 2 })
    expect(ipc().get().goal).toEqual({ roundsPerDay: 2, roundsToday: 1, met: false })
    updateSettings(db, { dailyGoalRounds: 3 })
    expect(ipc().get().goal.roundsPerDay).toBe(3)
  })

  it('validates the request: no field is accepted', () => {
    expect(() => ipc().get(undefined)).not.toThrow()
    expect(() => ipc().get({})).not.toThrow()
    expect(() => ipc().get({ now: 0 })).toThrow()
    expect(() => ipc().get('today')).toThrow()
  })
})
