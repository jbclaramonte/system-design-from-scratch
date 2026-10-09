import type { Database } from '../driver'
import type { Attempt, AttemptResult, Json, Question, QuestionType, Quiz, Round } from '../types'
import { fromFlag, fromIdList, fromJson, NOW, TIMESTAMP_COLUMNS, toFlag, toJson } from './mapping'

// Quizzes and questions

export interface NewQuestion {
  position: number
  type: QuestionType
  prompt: string
  body: Json
  notionIds: number[]
}

export interface NewQuiz {
  topicId: number
  grounded: boolean
  sourceSections?: string[]
  contentCacheKey?: string | null
  questions: NewQuestion[]
}

interface QuizRow extends Omit<Quiz, 'grounded' | 'sourceSections'> {
  grounded: number
  sourceSections: string
}

const QUIZ_COLUMNS = `id, topic_id AS topicId, grounded, source_sections AS sourceSections,
  content_cache_key AS contentCacheKey, ${TIMESTAMP_COLUMNS}`

const toQuiz = (row: QuizRow): Quiz => ({
  ...row,
  grounded: fromFlag(row.grounded),
  sourceSections: fromJson<string[]>(row.sourceSections)
})

interface QuestionRow extends Omit<Question, 'body' | 'notionIds'> {
  body: string
  notionIds: string | null
}

const QUESTION_SELECT = `SELECT q.id, q.quiz_id AS quizId, q.position, q.type, q.prompt, q.body,
    q.flagged_at AS flaggedAt, q.flag_reason AS flagReason,
    q.replaced_by_question_id AS replacedByQuestionId,
    q.created_at AS createdAt, q.updated_at AS updatedAt,
    (SELECT group_concat(notion_id) FROM
      (SELECT notion_id FROM question_notions WHERE question_id = q.id ORDER BY notion_id)
    ) AS notionIds
  FROM questions q`

const toQuestion = (row: QuestionRow): Question => ({
  ...row,
  body: fromJson(row.body),
  notionIds: fromIdList(row.notionIds)
})

/** Creates a quiz with its questions and their notion tags, atomically. */
export function createQuiz(db: Database, quiz: NewQuiz): Quiz {
  return db.transaction(() => {
    const { lastInsertRowid: quizId } = db
      .prepare(
        `INSERT INTO quizzes (topic_id, grounded, source_sections, content_cache_key)
         VALUES ($topicId, $grounded, $sourceSections, $contentCacheKey)`
      )
      .run({
        topicId: quiz.topicId,
        grounded: toFlag(quiz.grounded),
        sourceSections: toJson(quiz.sourceSections ?? []),
        contentCacheKey: quiz.contentCacheKey ?? null
      })
    for (const question of quiz.questions) insertQuestion(db, quizId, question)
    return getQuiz(db, quizId)!
  })
}

/** Inserts a question with its notion tags. Call inside a transaction. */
function insertQuestion(db: Database, quizId: number, question: NewQuestion): number {
  const { lastInsertRowid: questionId } = db
    .prepare(
      `INSERT INTO questions (quiz_id, position, type, prompt, body)
       VALUES ($quizId, $position, $type, $prompt, $body)`
    )
    .run({
      quizId,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
      body: toJson(question.body)
    })
  const tagQuestion = db.prepare(
    'INSERT INTO question_notions (question_id, notion_id) VALUES ($questionId, $notionId)'
  )
  for (const notionId of question.notionIds) tagQuestion.run({ questionId, notionId })
  return questionId
}

export function getQuiz(db: Database, id: number): Quiz | undefined {
  const row = db.prepare(`SELECT ${QUIZ_COLUMNS} FROM quizzes WHERE id = $id`).get<QuizRow>({ id })
  return row && toQuiz(row)
}

export function listQuizzesByTopic(db: Database, topicId: number): Quiz[] {
  return db
    .prepare(`SELECT ${QUIZ_COLUMNS} FROM quizzes WHERE topic_id = $topicId ORDER BY id DESC`)
    .all<QuizRow>({ topicId })
    .map(toQuiz)
}

export function getQuestion(db: Database, id: number): Question | undefined {
  const row = db.prepare(`${QUESTION_SELECT} WHERE q.id = $id`).get<QuestionRow>({ id })
  return row && toQuestion(row)
}

/** Questions played in a quiz, in order. Replaced (flagged and regenerated) ones are left out. */
export function listQuestions(db: Database, quizId: number): Question[] {
  return db
    .prepare(
      `${QUESTION_SELECT} WHERE q.quiz_id = $quizId AND q.replaced_by_question_id IS NULL
       ORDER BY q.position`
    )
    .all<QuestionRow>({ quizId })
    .map(toQuestion)
}

/** Every question of a quiz, replaced ones included (history), by position. */
export function listQuestionHistory(db: Database, quizId: number): Question[] {
  return db
    .prepare(`${QUESTION_SELECT} WHERE q.quiz_id = $quizId ORDER BY q.position`)
    .all<QuestionRow>({ quizId })
    .map(toQuestion)
}

/** Marks a question as faulty, with the learner's reason. Flagging again updates the reason. */
export function flagQuestion(db: Database, id: number, reason: string | null): Question {
  const { changes } = db
    .prepare(
      `UPDATE questions SET flagged_at = coalesce(flagged_at, ${NOW}), flag_reason = $reason,
         updated_at = ${NOW}
       WHERE id = $id`
    )
    .run({ id, reason })
  if (changes === 0) throw new Error(`Question ${id} does not exist.`)
  return getQuestion(db, id)!
}

/**
 * Replaces a flagged question in its quiz, atomically. The replacement takes the flagged
 * question's position; the flagged question is kept (its attempts stay valid), moved after the
 * last position and linked to its replacement. `position` of the replacement is ignored.
 */
export function replaceQuestion(
  db: Database,
  flaggedId: number,
  replacement: Omit<NewQuestion, 'position'>
): Question {
  return db.transaction(() => {
    const flagged = getQuestion(db, flaggedId)
    if (!flagged) throw new Error(`Question ${flaggedId} does not exist.`)
    if (flagged.flaggedAt === null) throw new Error(`Question ${flaggedId} is not flagged.`)
    if (flagged.replacedByQuestionId !== null) {
      throw new Error(`Question ${flaggedId} was already replaced.`)
    }
    db.prepare(
      `UPDATE questions SET position = (SELECT MAX(position) + 1 FROM questions
         WHERE quiz_id = $quizId), updated_at = ${NOW}
       WHERE id = $id`
    ).run({ id: flaggedId, quizId: flagged.quizId })
    const replacementId = insertQuestion(db, flagged.quizId, {
      ...replacement,
      position: flagged.position
    })
    db.prepare(
      `UPDATE questions SET replaced_by_question_id = $replacementId, updated_at = ${NOW}
       WHERE id = $id`
    ).run({ id: flaggedId, replacementId })
    return getQuestion(db, replacementId)!
  })
}

// Rounds

export interface NewRound {
  topicId: number
  quizId: number
  number: number
}

export interface RoundOutcome {
  scorePercent: number
  passed: boolean
}

interface RoundRow extends Omit<Round, 'passed'> {
  passed: number | null
}

const ROUND_COLUMNS = `id, topic_id AS topicId, quiz_id AS quizId, number, started_at AS startedAt,
  completed_at AS completedAt, score_percent AS scorePercent, passed, ${TIMESTAMP_COLUMNS}`

const toRound = (row: RoundRow): Round => ({
  ...row,
  passed: row.passed === null ? null : fromFlag(row.passed)
})

export function createRound(db: Database, round: NewRound): Round {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO rounds (topic_id, quiz_id, number) VALUES ($topicId, $quizId, $number)')
    .run({ topicId: round.topicId, quizId: round.quizId, number: round.number })
  return getRound(db, lastInsertRowid)!
}

export function completeRound(db: Database, id: number, outcome: RoundOutcome): Round {
  db.prepare(
    `UPDATE rounds SET completed_at = ${NOW}, score_percent = $scorePercent, passed = $passed,
       updated_at = ${NOW}
     WHERE id = $id`
  ).run({ id, scorePercent: outcome.scorePercent, passed: toFlag(outcome.passed) })
  return getRound(db, id)!
}

export function getRound(db: Database, id: number): Round | undefined {
  const row = db.prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE id = $id`).get<RoundRow>({ id })
  return row && toRound(row)
}

export function listRoundsByTopic(db: Database, topicId: number): Round[] {
  return db
    .prepare(`SELECT ${ROUND_COLUMNS} FROM rounds WHERE topic_id = $topicId ORDER BY id`)
    .all<RoundRow>({ topicId })
    .map(toRound)
}

// Attempts

export interface NewAttempt {
  questionId: number
  roundId?: number | null
  answer: Json
  result: AttemptResult
  score: number
  feedback?: string | null
  /** Defaults to now. */
  attemptedAt?: string
}

interface AttemptRow extends Omit<Attempt, 'answer' | 'notionIds'> {
  answer: string
  notionIds: string | null
}

const ATTEMPT_SELECT = `SELECT a.id, a.question_id AS questionId, a.round_id AS roundId,
    a.question_type AS questionType, a.answer, a.result, a.score, a.feedback,
    a.attempted_at AS attemptedAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
    (SELECT group_concat(notion_id) FROM
      (SELECT notion_id FROM attempt_notions WHERE attempt_id = a.id ORDER BY notion_id)
    ) AS notionIds
  FROM attempts a`

const toAttempt = (row: AttemptRow): Attempt => ({
  ...row,
  answer: fromJson(row.answer),
  notionIds: fromIdList(row.notionIds)
})

/**
 * Records an attempt. The question type and notion tags are copied from the question, so the
 * attempt history stays stable if the question is later retagged.
 */
export function recordAttempt(db: Database, attempt: NewAttempt): Attempt {
  return db.transaction(() => {
    const { changes, lastInsertRowid: attemptId } = db
      .prepare(
        `INSERT INTO attempts
           (question_id, round_id, question_type, answer, result, score, feedback, attempted_at)
         SELECT id, $roundId, type, $answer, $result, $score, $feedback,
           coalesce($attemptedAt, ${NOW})
         FROM questions WHERE id = $questionId`
      )
      .run({
        questionId: attempt.questionId,
        roundId: attempt.roundId ?? null,
        answer: toJson(attempt.answer),
        result: attempt.result,
        score: attempt.score,
        feedback: attempt.feedback ?? null,
        attemptedAt: attempt.attemptedAt ?? null
      })
    if (changes === 0) {
      throw new Error(`Question ${attempt.questionId} does not exist.`)
    }
    db.prepare(
      `INSERT INTO attempt_notions (attempt_id, notion_id)
       SELECT $attemptId, notion_id FROM question_notions WHERE question_id = $questionId`
    ).run({ attemptId, questionId: attempt.questionId })
    return getAttempt(db, attemptId)!
  })
}

export function getAttempt(db: Database, id: number): Attempt | undefined {
  const row = db.prepare(`${ATTEMPT_SELECT} WHERE a.id = $id`).get<AttemptRow>({ id })
  return row && toAttempt(row)
}

/** Every attempt on questions tagged with the notion, oldest first. */
export function listAttemptsByNotion(db: Database, notionId: number): Attempt[] {
  return db
    .prepare(
      `${ATTEMPT_SELECT}
       JOIN attempt_notions an ON an.attempt_id = a.id
       WHERE an.notion_id = $notionId
       ORDER BY a.attempted_at, a.id`
    )
    .all<AttemptRow>({ notionId })
    .map(toAttempt)
}

export function listAttemptsByRound(db: Database, roundId: number): Attempt[] {
  return db
    .prepare(`${ATTEMPT_SELECT} WHERE a.round_id = $roundId ORDER BY a.id`)
    .all<AttemptRow>({ roundId })
    .map(toAttempt)
}
