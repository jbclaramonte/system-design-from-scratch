import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { dayOfInZone } from '../activity/activity'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { completeRound, createQuiz, createRound } from '../db/repositories/assessment'
import { listBadgeUnlocks, markBadgeCelebrated } from '../db/repositories/badges'
import {
  addDesignFeedback,
  createDesignExercise,
  createProtocolStepSubmission,
  settleProtocolStepSubmission
} from '../db/repositories/designPractice'
import { addForcedUnlock } from '../db/repositories/forcedUnlocks'
import { getTopicBySlug } from '../db/repositories/learningContent'
import { declareMastery } from '../db/repositories/mastery'
import { createRewardsIpc } from './rewardsIpc'

const corpus = loadCorpus(corpusPath(process.cwd()))

let db: Database
let roundNumber = 0

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  seedTopics(db, corpus, [
    { slug: 'client-server', title: 'Client and server' },
    { slug: 'http', title: 'HTTP' }
  ])
  roundNumber = 0
})

afterEach(() => db.close())

const NOW = Date.parse('2026-10-24T12:00:00.000Z')
const ipc = () => createRewardsIpc(db, { now: () => NOW, dayOf: dayOfInZone('Europe/Paris') })
const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`

/** A completed round on `slug`, dated by `completed_at`. Returns its id. */
function playRound(slug: string, completedAt: string, scorePercent: number, passed: boolean) {
  const topic = getTopicBySlug(db, slug)!
  const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
  const round = createRound(db, { topicId: topic.id, quizId: quiz.id, number: ++roundNumber })
  completeRound(db, round.id, { scorePercent, passed })
  db.prepare('UPDATE rounds SET completed_at = $completedAt WHERE id = $id').run({
    id: round.id,
    completedAt
  })
  return round.id
}

function exercise() {
  return (
    db.prepare('SELECT id FROM design_exercises LIMIT 1').get<{ id: number }>() ??
    createDesignExercise(db, {
      slug: 'url-shortener',
      title: 'URL shortener',
      position: 1,
      grounded: false
    })
  )
}

function submitStep(
  step: 'functional_requirements' | 'api',
  status: 'reviewed' | 'failed' | 'pending',
  at: string
) {
  const submission = createProtocolStepSubmission(db, {
    designExerciseId: exercise().id,
    protocolStep: step,
    content: { type: 'text', text: 'text' }
  })
  if (status !== 'pending') settleProtocolStepSubmission(db, submission.id, { status })
  db.prepare('UPDATE protocol_step_submissions SET updated_at = $at WHERE id = $id').run({
    id: submission.id,
    at
  })
}

describe('createRewardsIpc.get', () => {
  it('starts a fresh install at Level 1 with every Badge locked and nothing remembered', () => {
    const summary = ipc().get()
    expect(summary.xp).toBe(0)
    expect(summary.level).toMatchObject({ level: 1, name: 'Novice' })
    expect(summary.badges.length).toBeGreaterThan(0)
    expect(summary.badges.every((badge) => !badge.earned)).toBe(true)
    expect(listBadgeUnlocks(db)).toEqual([])
  })

  it('counts the history already stored (no new event needed) and remembers the Badges', () => {
    playRound('client-server', day(20), 40, false)
    playRound('client-server', day(21), 100, true)
    const summary = ipc().get()
    expect(summary.xp).toBe(8 + 30 + 50)
    const earned = summary.badges.filter((badge) => badge.earned).map((badge) => badge.id)
    expect(earned).toEqual(['first-topic-mastered', 'perfect-round', 'comeback'])
    expect(listBadgeUnlocks(db)).toEqual([
      { badgeId: 'comeback', unlockedAt: day(21), celebrated: false },
      { badgeId: 'first-topic-mastered', unlockedAt: day(21), celebrated: false },
      { badgeId: 'perfect-round', unlockedAt: day(21), celebrated: false }
    ])
  })

  it('keeps the first unlock and a celebration across calls', () => {
    playRound('client-server', day(20), 100, true)
    ipc().get()
    expect(markBadgeCelebrated(db, 'perfect-round')).toBe(true)
    expect(markBadgeCelebrated(db, 'perfect-round')).toBe(false)
    expect(markBadgeCelebrated(db, 'unknown')).toBe(false)
    playRound('http', day(22), 100, true)
    ipc().get()
    ipc().get()
    const rows = listBadgeUnlocks(db)
    // First Topic, Perfect Round and (with the second Foundations topic) Foundations complete.
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.badgeId === 'foundations-completed')!.unlockedAt).toBe(day(22))
    expect(rows.find((row) => row.badgeId === 'perfect-round')).toEqual({
      badgeId: 'perfect-round',
      unlockedAt: day(20),
      celebrated: true
    })
  })

  it('unlocks Foundations complete when every Foundations topic has a passed Round', () => {
    playRound('client-server', day(20), 100, true)
    expect(
      ipc()
        .get()
        .badges.find((b) => b.id === 'foundations-completed')!.earned
    ).toBe(false)
    playRound('http', day(21), 80, true)
    const badge = ipc()
      .get()
      .badges.find((b) => b.id === 'foundations-completed')!
    expect(badge).toMatchObject({ earned: true, unlockedAt: day(21) })
  })

  it('pays nothing for a Declared Mastery, a Forced Unlock or an open Round', () => {
    declareMastery(db, getTopicBySlug(db, 'client-server')!.id)
    addForcedUnlock(db, 'topic:http')
    addForcedUnlock(db, 'design_exercise:url-shortener')
    const topic = getTopicBySlug(db, 'http')!
    const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
    createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    const summary = ipc().get()
    expect(summary.xp).toBe(0)
    expect(summary.badges.some((badge) => badge.earned)).toBe(false)
  })

  it('pays a Declared topic its first mastery only when a Round passes later', () => {
    declareMastery(db, getTopicBySlug(db, 'client-server')!.id)
    playRound('client-server', day(22), 100, true)
    expect(ipc().get().xp).toBe(30 + 50)
  })

  it('pays reviewed Protocol Steps once, and nothing for failed or pending ones', () => {
    submitStep('functional_requirements', 'failed', day(20))
    submitStep('functional_requirements', 'pending', day(20))
    expect(ipc().get().xp).toBe(0)
    submitStep('functional_requirements', 'reviewed', day(21))
    submitStep('functional_requirements', 'reviewed', day(22))
    submitStep('api', 'reviewed', day(22))
    expect(ipc().get().xp).toBe(2 * 15)
  })

  it('pays a Design Exercise once at its final review and unlocks its Badge', () => {
    const { id } = exercise()
    const review = () =>
      addDesignFeedback(db, {
        designExerciseId: id,
        kind: 'final_review',
        protocolStep: null,
        content: { review: {} },
        grounded: true
      })
    review()
    review()
    const summary = ipc().get()
    expect(summary.xp).toBe(100)
    expect(summary.badges.find((b) => b.id === 'first-design-exercise')!.earned).toBe(true)
  })

  it('rejects a request with a field', () => {
    expect(() => ipc().get(undefined)).not.toThrow()
    expect(() => ipc().get({})).not.toThrow()
    expect(() => ipc().get({ now: 0 })).toThrow()
  })
})

describe('createRewardsIpc.getRound', () => {
  it('says why a Round paid: "+30 XP: Round passed" and the first mastery', () => {
    const id = playRound('client-server', day(20), 100, true)
    const second = playRound('client-server', day(21), 100, true)
    const first = ipc().getRound({ roundId: id })
    expect(first.total).toBe(80)
    expect(first.awards.map((award) => `+${award.xp} XP: ${award.reason}`)).toEqual([
      '+30 XP: Round passed',
      '+50 XP: Topic mastered'
    ])
    expect(ipc().getRound({ roundId: second }).awards).toEqual([
      { xp: 30, kind: 'round_passed', reason: 'Round passed' }
    ])
  })

  it('says a failed Round paid its score', () => {
    const id = playRound('http', day(20), 60, false)
    expect(ipc().getRound({ roundId: id })).toMatchObject({
      total: 12,
      awards: [{ xp: 12, reason: 'Round completed' }]
    })
  })

  it('refuses an open or unknown Round and a malformed request', () => {
    const topic = getTopicBySlug(db, 'http')!
    const quiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
    const open = createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    expect(() => ipc().getRound({ roundId: open.id })).toThrow(/not completed/)
    expect(() => ipc().getRound({ roundId: 999 })).toThrow(/not completed/)
    expect(() => ipc().getRound({ roundId: 0 })).toThrow()
    expect(() => ipc().getRound({ roundId: 1.5 })).toThrow()
    expect(() => ipc().getRound({ roundId: 1, extra: true } as never)).toThrow()
    expect(() => ipc().getRound({} as never)).toThrow()
  })
})
