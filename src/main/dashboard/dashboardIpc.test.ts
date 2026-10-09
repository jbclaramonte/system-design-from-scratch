import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  listQuestions,
  recordAttempt
} from '../db/repositories/assessment'
import { createNotions, getTopicBySlug } from '../db/repositories/learningContent'
import { updateSettings } from '../db/repositories/settings'
import type { Notion, Question } from '../db/types'
import type { FreeAnswerGrading, FreeAnswerGradingRecord } from '../../shared/quiz'
import { createDashboardIpc } from './dashboardIpc'

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

/** Rounds start now by default: date them like the attempts. */
function dateRound(id: number, startedAt: string, completedAt: string | null = null) {
  db.prepare(
    'UPDATE rounds SET started_at = $startedAt, completed_at = coalesce($completedAt, completed_at) WHERE id = $id'
  ).run({ id, startedAt, completedAt })
}

const grading = (verdict: FreeAnswerGrading['verdict']): FreeAnswerGrading => ({
  verdict,
  expectedPoints: [{ covered: verdict === 'correct', justification: '' }],
  misconceptions: [],
  explanation: 'Explanation',
  toReview: []
})

/** A failed round 1 (one choice question right, a contested free answer wrong) and an open round 2. */
function seedClientServer() {
  const topic = getTopicBySlug(db, 'client-server')!
  const [request, response] = createNotions(db, [
    { topicId: topic.id, slug: 'request', title: 'Request' },
    { topicId: topic.id, slug: 'response', title: 'Response' }
  ]) as [Notion, Notion]
  const quiz = createQuiz(db, {
    topicId: topic.id,
    grounded: false,
    questions: [
      {
        position: 1,
        type: 'single_choice',
        prompt: 'Qui envoie la requête ?',
        body: { choices: [], explanation: '' },
        notionIds: [request.id]
      },
      {
        position: 2,
        type: 'free_answer',
        prompt: 'Décrivez une réponse HTTP.',
        body: { expectedPoints: ['status'], modelAnswer: '' },
        notionIds: [response.id]
      }
    ]
  })
  const [choice, free] = listQuestions(db, quiz.id) as [Question, Question]
  const round1 = createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
  recordAttempt(db, {
    questionId: choice.id,
    roundId: round1.id,
    answer: { selected: [0] },
    result: 'correct',
    score: 1,
    attemptedAt: '2026-10-01T10:00:00.000Z'
  })
  // Contested: re-graded (still incorrect), the first grading kept in the history.
  const record: FreeAnswerGradingRecord = {
    promptVersion: 'free-answer-grading-1',
    grading: grading('incorrect'),
    contest: { justification: 'I did mention the status.', contestedAt: '2026-10-01T10:02:00Z' },
    history: [{ promptVersion: 'free-answer-grading-1', grading: grading('partially_correct') }]
  }
  recordAttempt(db, {
    questionId: free.id,
    roundId: round1.id,
    answer: { text: 'Une réponse.' },
    result: 'incorrect',
    score: 0,
    feedback: JSON.stringify(record),
    attemptedAt: '2026-10-01T10:01:00.000Z'
  })
  completeRound(db, round1.id, { scorePercent: 50, passed: false })
  dateRound(round1.id, '2026-10-01T09:59:00.000Z', '2026-10-01T10:03:00.000Z')
  const quiz2 = createQuiz(db, {
    topicId: topic.id,
    grounded: false,
    questions: [
      {
        position: 1,
        type: 'multiple_choice',
        prompt: 'Quels éléments ?',
        body: { choices: [], explanation: '' },
        notionIds: [request.id, response.id]
      }
    ]
  })
  const round2 = createRound(db, { topicId: topic.id, quizId: quiz2.id, number: 2 })
  dateRound(round2.id, '2026-10-02T08:59:00.000Z')
  const [question2] = listQuestions(db, quiz2.id)
  recordAttempt(db, {
    questionId: question2!.id,
    roundId: round2.id,
    answer: { selected: [0, 1] },
    result: 'partially_correct',
    score: 0,
    attemptedAt: '2026-10-02T09:00:00.000Z'
  })
  return { topic, request, response }
}

describe('createDashboardIpc', () => {
  it('returns an empty Dashboard on a fresh database', () => {
    const dashboard = createDashboardIpc({ db, corpus }).get({})
    expect(dashboard.overview.roundsCompleted).toBe(0)
    expect(dashboard.overview.attemptCount).toBe(0)
    expect(dashboard.overview.lastActivityAt).toBeNull()
    expect(dashboard.overview.totalTopics).toBe(dashboard.topics.length)
    expect(dashboard.topics[0]!.step.topic.slug).toBe('client-server')
    expect(dashboard.topics[1]!.step.status).toBe('locked')
    expect(dashboard.notionMap).toEqual([])
    expect(dashboard.weakPoints).toEqual([])
    expect(dashboard.history).toEqual([])
    expect(dashboard.masteryThreshold).toBe(100)
  })

  it('reads rounds, attempts and notions from the database', () => {
    const { topic } = seedClientServer()
    const dashboard = createDashboardIpc({ db, corpus }).get({})

    const row = dashboard.topics.find((t) => t.step.topic.id === topic.id)!
    expect(row.rounds.map((r) => [r.number, r.status, r.attemptCount])).toEqual([
      [1, 'failed', 2],
      [2, 'in_progress', 1]
    ])
    expect(row.step.status).toBe('in_progress')
    expect(row.lastPracticedAt).toBe('2026-10-02T09:00:00.000Z')

    expect(dashboard.notionMap.map((map) => map.slug)).toEqual(['client-server'])
    const [request, response] = dashboard.notionMap[0]!.notions
    // The open round's attempt counts as practice, not as a score.
    expect(request).toMatchObject({ latestScorePercent: 100, mastered: true, attemptCount: 2 })
    expect(response).toMatchObject({ latestScorePercent: 0, mastered: false, attemptCount: 2 })

    expect(dashboard.weakPoints.map((w) => [w.notion.slug, w.reason])).toEqual([
      ['response', 'Missed in 1 of 1 round, the last one']
    ])
    expect(dashboard.overview).toMatchObject({
      roundsCompleted: 1,
      roundsInProgress: 1,
      attemptCount: 3,
      lastActivityAt: '2026-10-02T09:00:00.000Z'
    })
    expect(dashboard.overview.accuracyPercent).toBeCloseTo(100 / 3)

    const [open, failed] = dashboard.history
    expect(open!.status).toBe('in_progress')
    expect(failed!.attempts.map((a) => [a.questionType, a.result, a.contested])).toEqual([
      ['single_choice', 'correct', false],
      ['free_answer', 'incorrect', true]
    ])
    expect(failed!.attempts[1]!.prompt).toBe('Décrivez une réponse HTTP.')
    expect(failed!.attempts[1]!.notions.map((n) => n.slug)).toEqual(['response'])
  })

  it('uses the current Mastery Threshold for notions, the stored outcome for rounds', () => {
    seedClientServer()
    updateSettings(db, { masteryThreshold: 50 })
    const dashboard = createDashboardIpc({ db, corpus }).get({})
    expect(dashboard.masteryThreshold).toBe(50)
    expect(dashboard.topics[0]!.rounds[0]!.status).toBe('failed')
    expect(dashboard.weakPoints.map((w) => w.notion.slug)).toEqual(['response'])
  })

  it('filters the history by topic', () => {
    const { topic } = seedClientServer()
    const http = getTopicBySlug(db, 'http')!
    const ipc = createDashboardIpc({ db, corpus })
    expect(ipc.get({ topicId: topic.id }).history).toHaveLength(2)
    const filtered = ipc.get({ topicId: http.id })
    expect(filtered.history).toEqual([])
    expect(filtered.historyTopicId).toBe(http.id)
    expect(filtered.topics.length).toBeGreaterThan(2)
  })

  it('validates the request', () => {
    const ipc = createDashboardIpc({ db, corpus })
    expect(() => ipc.get({ topicId: 0 })).toThrow()
    expect(() => ipc.get({ topicId: 1.5 })).toThrow()
    expect(() => ipc.get({ topicId: '1' } as unknown as { topicId: number })).toThrow()
    expect(() => ipc.get({ extra: true } as unknown as { topicId: number })).toThrow()
    expect(() => ipc.get({ topicId: 99999 })).toThrow('not on the Learning Path')
    expect(ipc.get(undefined as unknown as { topicId?: number }).historyTopicId).toBeNull()
  })
})
