// Recall service: builds a Recall Quiz (the gate before a Lesson, or a practice session started
// from Memory Review), grades its answers locally, completes it, and reads Memory Review. A
// Recall session is not a Round: its Attempts never change mastery, XP, the streak or the Daily
// Goal, and nothing here touches the Learning Path (see "Constraints" in the design spec).
import type { Database } from '../db'
import {
  getQuestion,
  getQuiz,
  listAttemptsByRecallSession,
  recordAttempt
} from '../db/repositories/assessment'
import { getNotion, getTopic } from '../db/repositories/learningContent'
import {
  completeRecallSession,
  createRecallSession,
  getRecallSession,
  hasCompletedGateSession,
  listOpenGateSessions,
  listRecallSessionQuestionIds
} from '../db/repositories/recall'
import { getGenerationLanguage } from '../db/repositories/settings'
import type { Attempt, Question, RecallSession } from '../db/types'
import {
  locallyGradedTypes,
  type NotionRef,
  type QuestionClarification,
  type QuestionFeedback,
  type SubmittedAnswer
} from '../../shared/quiz'
import type {
  MemoryReviewNotion,
  MemoryReviewView,
  RecallHint,
  RecallNotionOutcome,
  RecallQuestionView,
  RecallResult,
  RecallSessionView,
  RecallStart
} from '../../shared/recall'
import {
  choiceAttemptFeedback,
  gradeAnswer,
  localGraders,
  questionBrief,
  questionPresentation
} from '../quiz/grading'
import type { QuestionClarifier } from '../quiz/questionClarifier'
import { eligibleTopicIds } from './eligibility'
import { classifyNotion, RECALL_WINDOW, type NotionRecallStatus } from './memory'
import {
  loadNotionLastSeen,
  loadNotionResults,
  loadPassedTopics,
  loadRecallCandidates
} from './queries'
import { selectRecallQuestions, type RecallCandidate } from './selection'

export interface RecallService {
  /**
   * The Recall Quiz taken before the Lesson of the Topic opens: resumes its open session (with
   * the feedback of the questions already answered) or builds a new one. Null when the gate of
   * the Topic was already completed, when no Topic is eligible, or when no question can be asked.
   * Never waits for a Generation.
   */
  prepareGate(topicId: number): RecallStart | null
  /**
   * A practice session: every passed Topic is eligible, the most recent one included. Restricted
   * to questions on the given Notions when `notionIds` is given. Null when no question exists.
   */
  startPractice(notionIds?: readonly number[]): RecallStart | null
  /** Grades an answer locally and records it as an Attempt of the session, once per question. */
  submitAnswer(sessionId: number, submitted: SubmittedAnswer): QuestionFeedback
  /** Completes the session. Refused while a question is unanswered. */
  complete(sessionId: number): RecallResult
  /**
   * Rewords a question of the open session that is not answered yet, from what the learner sees
   * only. Records nothing. Rejects with the `GenerationError` when the Generation fails.
   */
  clarifyQuestion(
    sessionId: number,
    questionId: number,
    options?: { another?: boolean; signal?: AbortSignal }
  ): Promise<{ clarification: QuestionClarification; fromCache: boolean }>
  getMemoryReview(): MemoryReviewView
}

export interface RecallServiceOptions {
  /** Rewords questions. Without it, `clarifyQuestion` is refused. */
  questionClarifier?: QuestionClarifier
  now?: () => Date
  random?: () => number
}

const toSessionView = (session: RecallSession): RecallSessionView => ({
  id: session.id,
  kind: session.kind,
  topicId: session.topicId,
  startedAt: session.startedAt,
  completedAt: session.completedAt
})

const isLocallyGraded = (question: Question) =>
  (locallyGradedTypes as readonly string[]).includes(question.type)

export function createRecallService(
  db: Database,
  { questionClarifier, now = () => new Date(), random = Math.random }: RecallServiceOptions = {}
): RecallService {
  const notionRef = (id: number): NotionRef | undefined => {
    const notion = getNotion(db, id)
    return notion && { id: notion.id, slug: notion.slug, title: notion.title }
  }

  function requireSession(sessionId: number): RecallSession {
    const session = getRecallSession(db, sessionId)
    if (!session) throw new Error(`Recall session ${sessionId} does not exist.`)
    return session
  }

  function requireOpenSession(sessionId: number): RecallSession {
    const session = requireSession(sessionId)
    if (session.completedAt !== null) {
      throw new Error(`Recall session ${sessionId} is already completed.`)
    }
    return session
  }

  function requireQuestionInSession(session: RecallSession, questionId: number): Question {
    const question = getQuestion(db, questionId)
    if (!question || !listRecallSessionQuestionIds(db, session.id).includes(questionId)) {
      throw new Error(`Question ${questionId} is not part of recall session ${session.id}.`)
    }
    return question
  }

  const sessionAttempts = (session: RecallSession): Map<number, Attempt> =>
    new Map(
      listAttemptsByRecallSession(db, session.id).map((attempt) => [attempt.questionId, attempt])
    )

  function requireUnanswered(session: RecallSession, questionId: number): void {
    if (sessionAttempts(session).has(questionId)) {
      throw new Error(`Question ${questionId} is already answered in recall session ${session.id}.`)
    }
  }

  /** The stored grading of an attempt, with the answer key re-attached. */
  function attemptFeedback(attempt: Attempt): QuestionFeedback {
    return choiceAttemptFeedback(getQuestion(db, attempt.questionId)!, attempt, localGraders)
  }

  /** The window of the shakiest Notion of the question, if one needs attention. */
  function recallHint(
    notionIds: readonly number[],
    results: ReadonlyMap<number, boolean[]>
  ): RecallHint | null {
    let hint: RecallHint | null = null
    for (const notionId of notionIds) {
      const window = (results.get(notionId) ?? []).slice(-RECALL_WINDOW)
      if (classifyNotion(window) !== 'needs_attention') continue
      const missed = window.filter((correct) => !correct).length
      if (hint === null || missed > hint.missed) hint = { missed, of: window.length }
    }
    return hint
  }

  function start(session: RecallSession): RecallStart {
    const results = loadNotionResults(db)
    const questions = listRecallSessionQuestionIds(db, session.id).map(
      (questionId, position): RecallQuestionView => {
        const question = getQuestion(db, questionId)
        if (!question) throw new Error(`Question ${questionId} does not exist.`)
        if (!isLocallyGraded(question)) {
          throw new Error(`Question ${questionId} cannot be graded locally.`)
        }
        return {
          id: question.id,
          position,
          type: question.type,
          prompt: question.prompt,
          ...questionPresentation(question),
          notions: question.notionIds.flatMap((id) => notionRef(id) ?? []),
          gradable: true,
          recallHint: recallHint(question.notionIds, results)
        }
      }
    )
    return {
      session: toSessionView(session),
      questions,
      answered: [...sessionAttempts(session).values()].map(attemptFeedback)
    }
  }

  /** Question ids of a new session: reused and new questions of the Topics, weighted. */
  function pickQuestions(
    topicIds: readonly number[],
    keep: (candidate: RecallCandidate) => boolean = () => true
  ): number[] {
    const candidates = loadRecallCandidates(db, {
      topicIds,
      language: getGenerationLanguage(db)
    }).filter(keep)
    if (candidates.length === 0) return []
    const status = new Map<number, NotionRecallStatus | 'untracked'>()
    for (const [notionId, results] of loadNotionResults(db)) {
      status.set(notionId, classifyNotion(results))
    }
    return selectRecallQuestions({ candidates, status, now: now(), random })
  }

  /** An open session is resumed only if all its questions are in the current Generation Language. */
  function inCurrentLanguage(session: RecallSession): boolean {
    const language = getGenerationLanguage(db)
    return listRecallSessionQuestionIds(db, session.id).every((questionId) => {
      const question = getQuestion(db, questionId)
      return question !== undefined && getQuiz(db, question.quizId)?.language === language
    })
  }

  return {
    prepareGate(topicId) {
      return db.transaction(() => {
        if (hasCompletedGateSession(db, topicId)) return null
        // Newest first: a language round-trip (fr, en, fr) resumes the session left in fr.
        const open = listOpenGateSessions(db, topicId).find(inCurrentLanguage)
        if (open) return start(open)
        const eligible = eligibleTopicIds(loadPassedTopics(db), topicId)
        const questionIds = pickQuestions(eligible)
        if (questionIds.length === 0) return null
        return start(createRecallSession(db, { kind: 'gate', topicId, questionIds }))
      })
    },

    startPractice(notionIds) {
      return db.transaction(() => {
        const wanted = notionIds && new Set(notionIds)
        const questionIds = pickQuestions(
          loadPassedTopics(db).map((topic) => topic.topicId),
          (candidate) => !wanted || candidate.notionIds.some((id) => wanted.has(id))
        )
        if (questionIds.length === 0) return null
        return start(createRecallSession(db, { kind: 'practice', topicId: null, questionIds }))
      })
    },

    submitAnswer(sessionId, { questionId, answer }) {
      return db.transaction(() => {
        const session = requireOpenSession(sessionId)
        const question = requireQuestionInSession(session, questionId)
        if (!isLocallyGraded(question)) {
          throw new Error(`Question ${questionId} cannot be graded locally.`)
        }
        requireUnanswered(session, questionId)
        const graded = gradeAnswer(question, answer, localGraders)
        recordAttempt(db, {
          questionId,
          roundId: null,
          recallSessionId: session.id,
          answer: graded.answer,
          ...graded.grading
        })
        return graded.feedback
      })
    },

    complete(sessionId) {
      return db.transaction(() => {
        const session = requireSession(sessionId)
        const questionIds = listRecallSessionQuestionIds(db, sessionId)
        const attempts = sessionAttempts(session)
        const missing = questionIds.filter((questionId) => !attempts.has(questionId))
        if (missing.length > 0) {
          throw new Error(
            `Recall session ${sessionId} has ${missing.length} unanswered question(s): ${missing.join(', ')}.`
          )
        }
        const completed = completeRecallSession(db, sessionId)
        const ordered = questionIds.map((questionId) => attempts.get(questionId)!)
        const outcomes = new Map<number, { correct: number; asked: number }>()
        for (const attempt of ordered) {
          for (const notionId of attempt.notionIds) {
            const outcome = outcomes.get(notionId) ?? { correct: 0, asked: 0 }
            outcome.asked += 1
            if (attempt.result === 'correct') outcome.correct += 1
            outcomes.set(notionId, outcome)
          }
        }
        return {
          session: toSessionView(completed),
          questions: ordered.map(attemptFeedback),
          notionOutcomes: [...outcomes].flatMap(([notionId, outcome]): RecallNotionOutcome[] => {
            const notion = notionRef(notionId)
            return notion ? [{ notion, ...outcome }] : []
          })
        }
      })
    },

    async clarifyQuestion(sessionId, questionId, options) {
      if (!questionClarifier) throw new Error('Question clarification is not available.')
      const session = requireOpenSession(sessionId)
      const question = requireQuestionInSession(session, questionId)
      requireUnanswered(session, questionId)
      const quiz = getQuiz(db, question.quizId)
      if (!quiz) throw new Error(`Quiz ${question.quizId} does not exist.`)
      const brief = questionBrief(question, {
        topicTitle: getTopic(db, quiz.topicId)?.title ?? '',
        language: quiz.language
      })
      return questionClarifier.clarify(brief, options)
    },

    getMemoryReview() {
      const lastSeen = loadNotionLastSeen(db)
      const groups: Record<NotionRecallStatus, MemoryReviewNotion[]> = {
        needs_attention: [],
        steadier: [],
        solid: []
      }
      for (const [notionId, results] of loadNotionResults(db)) {
        const status = classifyNotion(results)
        if (status === 'untracked') continue
        const notion = getNotion(db, notionId)
        const topic = notion && getTopic(db, notion.topicId)
        if (!notion || !topic) continue
        const lastResults = results.slice(-RECALL_WINDOW)
        groups[status].push({
          notion: { id: notion.id, slug: notion.slug, title: notion.title },
          topicTitle: topic.title,
          topicSlug: topic.slug,
          lastResults,
          missed: lastResults.filter((correct) => !correct).length,
          of: lastResults.length,
          lastSeenAt: lastSeen.get(notionId) ?? null,
          sourceSections: notion.sourceSections
        })
      }
      for (const group of Object.values(groups)) {
        group.sort((a, b) => b.missed - a.missed || a.notion.id - b.notion.id)
      }
      return {
        tracked: groups.needs_attention.length + groups.steadier.length + groups.solid.length,
        needsAttention: groups.needs_attention.length,
        steadier: groups.steadier.length,
        solid: groups.solid.length,
        groups
      }
    }
  }
}
