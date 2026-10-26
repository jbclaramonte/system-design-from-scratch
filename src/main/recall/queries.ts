// Recall queries: the rows the pure functions of this folder work on, read from the database. The
// answer-window rules are in docs/Data Model.md (Recall Quiz data).
import type { GenerationLanguage } from '../../shared/generationLanguage'
import type { Database } from '../db'
import { fromIdList } from '../db/repositories/mapping'
import type { RecallCandidate } from './selection'
import { passedTopics, type PassedTopic } from './eligibility'

/**
 * Results per Notion, oldest first (`true` is correct), from completed Rounds and completed
 * Recall sessions. A Question counts once per session, with its final Attempt, for each Notion it
 * was tagged with at the time. An Attempt on a replaced question (a faulty one) is left out, as
 * the Round scores do. Only `correct` is correct: `partially_correct` and `incorrect` are missed.
 * The caller keeps the last `RECALL_WINDOW` results (`classifyNotion` does).
 */
export function loadNotionResults(db: Database): Map<number, boolean[]> {
  const rows = db
    .prepare(
      `SELECT a.question_id AS questionId, a.round_id AS roundId,
              a.recall_session_id AS recallSessionId, a.result, an.notion_id AS notionId
       FROM attempts a
       JOIN attempt_notions an ON an.attempt_id = a.id
       JOIN questions q ON q.id = a.question_id AND q.replaced_by_question_id IS NULL
       LEFT JOIN rounds r ON r.id = a.round_id
       LEFT JOIN recall_sessions s ON s.id = a.recall_session_id
       WHERE r.completed_at IS NOT NULL OR s.completed_at IS NOT NULL
       ORDER BY a.attempted_at, a.id`
    )
    .all<{
      questionId: number
      roundId: number | null
      recallSessionId: number | null
      result: string
      notionId: number
    }>()

  // Rows are oldest first: a later Attempt on the same Question in the same session replaces the
  // earlier one, and moves to the end, where it happened.
  const finals = new Map<string, { notionId: number; correct: boolean }>()
  for (const row of rows) {
    const session = row.roundId !== null ? `round:${row.roundId}` : `recall:${row.recallSessionId}`
    const key = `${session}:${row.questionId}:${row.notionId}`
    finals.delete(key)
    finals.set(key, { notionId: row.notionId, correct: row.result === 'correct' })
  }

  const results = new Map<number, boolean[]>()
  for (const { notionId, correct } of finals.values()) {
    const list = results.get(notionId)
    if (list) list.push(correct)
    else results.set(notionId, [correct])
  }
  return results
}

/**
 * Time of the latest answer per Notion, from the same answers `loadNotionResults` counts (so never
 * more recent than the results shown).
 */
export function loadNotionLastSeen(db: Database): Map<number, string> {
  const rows = db
    .prepare(
      `SELECT an.notion_id AS notionId, MAX(a.attempted_at) AS lastSeenAt
       FROM attempts a
       JOIN attempt_notions an ON an.attempt_id = a.id
       JOIN questions q ON q.id = a.question_id AND q.replaced_by_question_id IS NULL
       LEFT JOIN rounds r ON r.id = a.round_id
       LEFT JOIN recall_sessions s ON s.id = a.recall_session_id
       WHERE r.completed_at IS NOT NULL OR s.completed_at IS NOT NULL
       GROUP BY an.notion_id`
    )
    .all<{ notionId: number; lastSeenAt: string }>()
  return new Map(rows.map((row) => [row.notionId, row.lastSeenAt]))
}

/** Topics the learner passed (a passing Round or a Declared Mastery), with their passed date. */
export function loadPassedTopics(db: Database): PassedTopic[] {
  const rounds = db
    .prepare(
      `SELECT topic_id AS topicId, completed_at AS completedAt, passed FROM rounds
       WHERE passed = 1 AND completed_at IS NOT NULL`
    )
    .all<{ topicId: number; completedAt: string; passed: number }>()
    .map((row) => ({ ...row, passed: row.passed === 1 }))
  const declared = db
    .prepare('SELECT topic_id AS topicId, created_at AS createdAt FROM declared_masteries')
    .all<{ topicId: number; createdAt: string }>()
  return passedTopics({ rounds, declared })
}

/**
 * Questions a Recall Quiz may reuse from the given Topics: of any quiz (Round or recall), a
 * single choice, multiple choice or scenario question (graded locally), not flagged, not
 * replaced, in the Generation Language. `origin` is `new` for a question never asked.
 */
export function loadRecallCandidates(
  db: Database,
  options: { topicIds: readonly number[]; language: GenerationLanguage }
): RecallCandidate[] {
  if (options.topicIds.length === 0) return []
  const params: Record<string, number | string> = { language: options.language }
  const placeholders = options.topicIds.map((topicId, index) => {
    params[`topic${index}`] = topicId
    return `$topic${index}`
  })
  return db
    .prepare(
      `SELECT q.id AS questionId, z.topic_id AS topicId,
              (SELECT group_concat(notion_id) FROM
                (SELECT notion_id FROM question_notions WHERE question_id = q.id ORDER BY notion_id)
              ) AS notionIds,
              (SELECT MAX(attempted_at) FROM attempts WHERE question_id = q.id) AS lastAskedAt
       FROM questions q
       JOIN quizzes z ON z.id = q.quiz_id
       WHERE z.topic_id IN (${placeholders.join(', ')})
         AND z.language = $language
         AND q.type IN ('single_choice', 'multiple_choice', 'scenario')
         AND q.flagged_at IS NULL
         AND q.replaced_by_question_id IS NULL
       ORDER BY q.id`
    )
    .all<{
      questionId: number
      topicId: number
      notionIds: string | null
      lastAskedAt: string | null
    }>(params)
    .map((row) => ({
      questionId: row.questionId,
      topicId: row.topicId,
      notionIds: fromIdList(row.notionIds),
      origin: row.lastAskedAt === null ? 'new' : 'reused',
      lastAskedAt: row.lastAskedAt
    }))
}
