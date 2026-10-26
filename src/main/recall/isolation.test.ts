// The contract of the Recall Quiz data: recall quizzes and Recall sessions with their Attempts
// change nothing the Round-based computations read (quiz lists, mastery, Dashboard, rewards,
// Learning Path, Activity Streak).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedTopics } from '../content/topics'
import { corpusPath, loadCorpus } from '../corpus'
import { dayOfInZone } from '../activity/activity'
import { createActivityIpc } from '../activity/activityIpc'
import { createDashboardIpc } from '../dashboard/dashboardIpc'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  listAttemptsByRecallSession,
  listAttemptsByRound,
  listQuestions,
  listQuizzesByTopic,
  listRoundsByTopic,
  recordAttempt
} from '../db/repositories/assessment'
import { createNotions, getTopicBySlug } from '../db/repositories/learningContent'
import { completeRecallSession, createRecallSession } from '../db/repositories/recall'
import { getTopicMastery, latestNotionScores, listTopicMasteries } from '../mastery/queries'
import { getLearningPath } from '../path/pathIpc'
import { loadRewardHistory } from '../rewards/queries'
import { createRewardsIpc } from '../rewards/rewardsIpc'

const corpus = loadCorpus(corpusPath(process.cwd()))
const NOW = Date.parse('2026-10-26T12:00:00.000Z')
/** Fixed times on the same day as NOW, so a leak into the activity would show on any date. */
const MORNING = '2026-10-26T09:00:00.000Z'
const LATE_MORNING = '2026-10-26T10:00:00.000Z'
const dayOf = dayOfInZone('Europe/Paris')

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

/** Everything the Round-based computations produce. */
function readEverything(topicIds: number[]) {
  return {
    quizzes: topicIds.map((id) => listQuizzesByTopic(db, id)),
    rounds: topicIds.map((id) => listRoundsByTopic(db, id)),
    roundAttempts: topicIds.map((id) =>
      listRoundsByTopic(db, id).map((round) => listAttemptsByRound(db, round.id))
    ),
    mastery: topicIds.map((id) => getTopicMastery(db, id)),
    masteries: listTopicMasteries(db),
    notionScores: topicIds.map((id) => latestNotionScores(db, id)),
    dashboard: createDashboardIpc({ db, corpus }).get({}),
    rewardHistory: loadRewardHistory(db),
    rewards: createRewardsIpc(db, { now: () => NOW, dayOf }).get(),
    path: getLearningPath({ db, corpus }),
    activity: createActivityIpc(db, { now: () => NOW, dayOf }).get()
  }
}

describe('Recall data isolation', () => {
  it('leaves every Round-based read exactly as it was', () => {
    const clientServer = getTopicBySlug(db, 'client-server')!
    const http = getTopicBySlug(db, 'http')!
    const notions = createNotions(db, [
      { topicId: clientServer.id, slug: 'client', title: 'Client' },
      { topicId: clientServer.id, slug: 'server', title: 'Server' }
    ]).map((notion) => notion.id)

    const quiz = createQuiz(db, {
      topicId: clientServer.id,
      grounded: false,
      questions: notions.map((notionId, position) => ({
        position,
        type: 'single_choice' as const,
        prompt: `Round question ${position}`,
        body: {},
        notionIds: [notionId]
      }))
    })
    const [first, second] = listQuestions(db, quiz.id)
    const round = createRound(db, { topicId: clientServer.id, quizId: quiz.id, number: 1 })
    recordAttempt(db, {
      questionId: first!.id,
      roundId: round.id,
      answer: {},
      result: 'correct',
      score: 1,
      attemptedAt: MORNING
    })
    recordAttempt(db, {
      questionId: second!.id,
      roundId: round.id,
      answer: {},
      result: 'incorrect',
      score: 0,
      attemptedAt: MORNING
    })
    completeRound(db, round.id, { scorePercent: 50, passed: false })
    db.prepare('UPDATE rounds SET completed_at = $at WHERE id = $id').run({
      at: MORNING,
      id: round.id
    })

    const topicIds = [clientServer.id, http.id]
    const before = readEverything(topicIds)
    // The fixture must exercise something, or "unchanged" proves nothing.
    expect(before.quizzes[0]).toHaveLength(1)
    expect(before.rewardHistory.rounds).toHaveLength(1)
    expect(before.notionScores[0]).toHaveLength(2)
    // The Round counts today in the activity (one completed Round on the day of NOW).
    expect(before.activity.goal.roundsToday).toBe(1)

    // A recall quiz on the same Topic and on a Topic with no Round, and Recall sessions (one
    // completed with wrong answers that would drag mastery down, one still open).
    const recall = createQuiz(db, {
      topicId: clientServer.id,
      purpose: 'recall',
      grounded: false,
      questions: notions.map((notionId, position) => ({
        position,
        type: 'scenario' as const,
        prompt: `Recall question ${position}`,
        body: {},
        notionIds: [notionId]
      }))
    })
    const recallOnHttp = createQuiz(db, {
      topicId: http.id,
      purpose: 'recall',
      grounded: false,
      questions: []
    })
    const recallQuestions = listQuestions(db, recall.id)
    const completed = createRecallSession(db, {
      kind: 'gate',
      topicId: http.id,
      questionIds: [...recallQuestions, ...listQuestions(db, quiz.id)].map((q) => q.id)
    })
    for (const question of [...recallQuestions, ...listQuestions(db, quiz.id)]) {
      recordAttempt(db, {
        questionId: question.id,
        recallSessionId: completed.id,
        answer: {},
        result: 'incorrect',
        score: 0,
        attemptedAt: LATE_MORNING
      })
    }
    completeRecallSession(db, completed.id)
    db.prepare('UPDATE recall_sessions SET completed_at = $at WHERE id = $id').run({
      at: LATE_MORNING,
      id: completed.id
    })
    const open = createRecallSession(db, {
      kind: 'practice',
      topicId: null,
      questionIds: [recallQuestions[0]!.id]
    })
    recordAttempt(db, {
      questionId: recallQuestions[0]!.id,
      recallSessionId: open.id,
      answer: {},
      result: 'correct',
      score: 1,
      attemptedAt: LATE_MORNING
    })

    // The rows are really there...
    expect(listAttemptsByRecallSession(db, completed.id)).toHaveLength(4)
    expect(recallOnHttp.purpose).toBe('recall')
    // ...and nothing Round-based can see them.
    expect(readEverything(topicIds)).toEqual(before)
    expect(listQuizzesByTopic(db, clientServer.id).map((q) => q.id)).toEqual([quiz.id])
    expect(listQuizzesByTopic(db, http.id)).toEqual([])
  })
})
