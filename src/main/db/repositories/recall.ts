// Recall sessions: one taking of a Recall Quiz, with the questions it asks in order. Attempts of a
// session are recorded with `recordAttempt` (`recallSessionId`) and read back with `listAttemptsByRecallSession`.
import type { Database } from '../driver'
import type { RecallSession, RecallSessionKind } from '../types'
import { NOW, TIMESTAMP_COLUMNS } from './mapping'

export interface NewRecallSession {
  kind: RecallSessionKind
  /** The Topic being opened for a `gate`; null for `practice`. */
  topicId: number | null
  /** The questions asked, in order. */
  questionIds: readonly number[]
}

const SESSION_COLUMNS = `id, kind, topic_id AS topicId, started_at AS startedAt,
  completed_at AS completedAt, ${TIMESTAMP_COLUMNS}`

/** Creates a session with its questions, atomically. */
export function createRecallSession(db: Database, session: NewRecallSession): RecallSession {
  return db.transaction(() => {
    const { lastInsertRowid: sessionId } = db
      .prepare('INSERT INTO recall_sessions (kind, topic_id) VALUES ($kind, $topicId)')
      .run({ kind: session.kind, topicId: session.topicId })
    const add = db.prepare(
      `INSERT INTO recall_session_questions (session_id, question_id, position)
       VALUES ($sessionId, $questionId, $position)`
    )
    session.questionIds.forEach((questionId, position) =>
      add.run({ sessionId, questionId, position })
    )
    return getRecallSession(db, sessionId)!
  })
}

export function getRecallSession(db: Database, id: number): RecallSession | undefined {
  return db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM recall_sessions WHERE id = $id`)
    .get<RecallSession>({ id })
}

/** Gate sessions of the Topic that are not completed yet, newest first. */
export function listOpenGateSessions(db: Database, topicId: number): RecallSession[] {
  return db
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM recall_sessions
       WHERE kind = 'gate' AND topic_id = $topicId AND completed_at IS NULL
       ORDER BY id DESC`
    )
    .all<RecallSession>({ topicId })
}

/** True once a gate session of the Topic was completed: it is never asked again. */
export function hasCompletedGateSession(db: Database, topicId: number): boolean {
  return (
    db
      .prepare(
        `SELECT 1 AS done FROM recall_sessions
         WHERE kind = 'gate' AND topic_id = $topicId AND completed_at IS NOT NULL LIMIT 1`
      )
      .get<{ done: number }>({ topicId }) !== undefined
  )
}

/** Ids of the questions of a session, in the order they are asked. */
export function listRecallSessionQuestionIds(db: Database, sessionId: number): number[] {
  return db
    .prepare(
      'SELECT question_id AS id FROM recall_session_questions WHERE session_id = $sessionId ORDER BY position'
    )
    .all<{ id: number }>({ sessionId })
    .map((row) => row.id)
}

/** Completes a session. Completing a completed session keeps its first completion time. */
export function completeRecallSession(db: Database, id: number): RecallSession {
  const { changes } = db
    .prepare(
      `UPDATE recall_sessions SET completed_at = coalesce(completed_at, ${NOW}),
         updated_at = ${NOW}
       WHERE id = $id`
    )
    .run({ id })
  if (changes === 0) throw new Error(`Recall session ${id} does not exist.`)
  return getRecallSession(db, id)!
}
