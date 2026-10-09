// Quiz service: loads a quiz without its answer keys, plays it as a Round, grades each answer in
// the main process (choice questions locally, free answers through a Generation), records it as
// an Attempt tagged with notions, and completes the Round against the Mastery Threshold. The
// Mastery Loop around it (remediation, next round) is #11.
import type { Database } from '../db'
import {
  completeRound as storeRoundOutcome,
  createRound,
  findOpenRound,
  getQuestion,
  getQuiz,
  getRound,
  listAttemptsByRound,
  listQuestions,
  listQuizzesByTopic,
  nextRoundNumber,
  recordAttempt,
  updateAttemptGrading
} from '../db/repositories/assessment'
import { getTopic, listNotionsByTopic, listTopics } from '../db/repositories/learningContent'
import { getSettings } from '../db/repositories/settings'
import type { Attempt, Question, Quiz, Round } from '../db/types'
import {
  CONTEST_JUSTIFICATION_MAX_LENGTH,
  type FreeAnswerGradingRecord,
  type NotionRef,
  type QuestionFeedback,
  type QuestionView,
  type QuizSummary,
  type QuizTopic,
  type QuizView,
  type RoundResult,
  type RoundStart,
  type RoundView,
  type SubmittedAnswer
} from '../../shared/quiz'
import type { FreeAnswerGrader } from './freeAnswerGrader'
import {
  freeAnswerFeedback,
  gradeAnswer,
  InvalidAnswerError,
  localGraders,
  meetsThreshold,
  normalizeFreeAnswer,
  notionScores,
  parseChoiceBody,
  parseFreeAnswerBody,
  parseGradingRecord,
  quizScorePercent,
  recordGradingResult,
  type Graders
} from './grading'

export interface QuizService {
  listTopics(): QuizTopic[]
  listQuizzes(topicId: number): QuizSummary[]
  loadQuiz(quizId: number): QuizView
  /** Resumes the open round of the quiz, or starts one with the topic's next round number. */
  startRound(quizId: number): RoundStart
  /** Grades a choice answer locally and records it. Free answers go through `submitFreeAnswer`. */
  submitAnswer(roundId: number, submitted: SubmittedAnswer): QuestionFeedback
  /**
   * Grades a free answer through a Generation (outside any transaction), then records the
   * Attempt. Rejects with the `GenerationError` when the grading fails: nothing is recorded.
   */
  submitFreeAnswer(
    roundId: number,
    submitted: SubmittedAnswer,
    signal?: AbortSignal
  ): Promise<QuestionFeedback>
  /**
   * Contests the grade of a free answer, once: re-graded with the learner's justification, the
   * new grading replaces the first on the Attempt, which keeps the first in its history.
   */
  contestGrade(
    roundId: number,
    questionId: number,
    justification: string,
    signal?: AbortSignal
  ): Promise<QuestionFeedback>
  /** Submits the given answers (if any), then grades the round. Atomic. */
  completeRound(roundId: number, answers?: readonly SubmittedAnswer[]): RoundResult
  /** Result of a completed round. */
  getRoundResult(roundId: number): RoundResult
}

const toRoundView = (round: Round): RoundView => ({
  id: round.id,
  topicId: round.topicId,
  quizId: round.quizId,
  number: round.number,
  startedAt: round.startedAt,
  completedAt: round.completedAt,
  scorePercent: round.scorePercent,
  passed: round.passed
})

export interface QuizServiceOptions {
  /** Grades free answers. Without it, free-answer questions are skipped (left out of scores). */
  freeAnswerGrader?: FreeAnswerGrader
}

/** `graders` (synchronous, choice questions) defaults to the local ones. */
export function createQuizService(
  db: Database,
  graders: Graders = localGraders,
  { freeAnswerGrader }: QuizServiceOptions = {}
): QuizService {
  const gradable = (question: Question) =>
    graders[question.type] !== undefined ||
    (question.type === 'free_answer' && freeAnswerGrader !== undefined)

  /** Free-answer gradings in progress, by `roundId:questionId`: one at a time per question. */
  const gradingInProgress = new Set<string>()
  const gradingKey = (roundId: number, questionId: number) => `${roundId}:${questionId}`

  const notionRefs = (topicId: number): NotionRef[] =>
    listNotionsByTopic(db, topicId).map(({ id, slug, title }) => ({ id, slug, title }))

  function requireQuiz(quizId: number): Quiz {
    const quiz = getQuiz(db, quizId)
    if (!quiz) throw new Error(`Quiz ${quizId} does not exist.`)
    return quiz
  }

  function requireOpenRound(roundId: number): Round {
    const round = getRound(db, roundId)
    if (!round) throw new Error(`Round ${roundId} does not exist.`)
    if (round.completedAt !== null) throw new Error(`Round ${round.number} is already completed.`)
    return round
  }

  function toQuestionView(question: Question, notions: Map<number, NotionRef>): QuestionView {
    const choiceBody = question.type === 'free_answer' ? null : parseChoiceBody(question.body)
    return {
      id: question.id,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
      scenario: choiceBody?.scenario ?? null,
      // Texts only: the `correct` flags stay in the main process until the answer is graded.
      choices: choiceBody?.choices.map((choice) => choice.text) ?? [],
      notions: question.notionIds.flatMap((id) => notions.get(id) ?? []),
      gradable: gradable(question)
    }
  }

  /**
   * Feedback of a recorded attempt: the stored grading, with the answer key re-attached. A free
   * answer's grade can be contested while its round is open.
   */
  function attemptFeedback(attempt: Attempt, roundOpen: boolean): QuestionFeedback {
    const question = getQuestion(db, attempt.questionId)!
    if (question.type === 'free_answer') {
      const { text } = attempt.answer as { text: string }
      return freeAnswerFeedback(question, text, parseGradingRecord(attempt.feedback), {
        contestable: roundOpen
      })
    }
    const { feedback } = gradeAnswer(question, attempt.answer, graders)
    return { ...feedback, result: attempt.result, score: attempt.score, feedback: attempt.feedback }
  }

  /** Attempts of the round on the questions in play, by question id. */
  function roundAttempts(round: Round): Map<number, Attempt> {
    return new Map(listAttemptsByRound(db, round.id).map((a) => [a.questionId, a]))
  }

  /** A question in play in the round's quiz. */
  function requireQuestionInPlay(round: Round, questionId: number): Question {
    const question = getQuestion(db, questionId)
    if (!question || question.quizId !== round.quizId) {
      throw new Error(`Question ${questionId} is not part of round ${round.number}.`)
    }
    if (question.replacedByQuestionId !== null) {
      throw new Error(`Question ${questionId} was replaced.`)
    }
    return question
  }

  function requireUnanswered(round: Round, questionId: number): void {
    if (roundAttempts(round).has(questionId)) {
      throw new Error(`Question ${questionId} is already answered in round ${round.number}.`)
    }
  }

  function requireFreeAnswerGrader(): FreeAnswerGrader {
    if (!freeAnswerGrader) throw new Error('Free-answer grading is not available.')
    return freeAnswerGrader
  }

  /** Runs one free-answer grading of a question at a time; a second one is refused. */
  async function withGradingLock<T>(round: Round, questionId: number, run: () => Promise<T>) {
    const key = gradingKey(round.id, questionId)
    if (gradingInProgress.has(key)) {
      throw new Error(`Question ${questionId} is already being graded.`)
    }
    gradingInProgress.add(key)
    try {
      return await run()
    } finally {
      gradingInProgress.delete(key)
    }
  }

  function gradingRequestFor(round: Round, question: Question) {
    const body = parseFreeAnswerBody(question.body)
    const topicId = requireQuiz(round.quizId).topicId
    const notions = listNotionsByTopic(db, topicId)
      .filter((notion) => question.notionIds.includes(notion.id))
      .map(({ slug, title, description }) => ({ slug, title, description }))
    return {
      question: {
        prompt: question.prompt,
        expectedPoints: body.expectedPoints,
        modelAnswer: body.modelAnswer
      },
      notions
    }
  }

  function submit(round: Round, { questionId, answer }: SubmittedAnswer): QuestionFeedback {
    const question = requireQuestionInPlay(round, questionId)
    requireUnanswered(round, questionId)
    const graded = gradeAnswer(question, answer, graders)
    recordAttempt(db, {
      questionId,
      roundId: round.id,
      answer: graded.answer,
      ...graded.grading
    })
    return graded.feedback
  }

  function result(round: Round, masteryThreshold: number): RoundResult {
    const questions = listQuestions(db, round.quizId)
    const attempts = roundAttempts(round)
    const graded = questions.filter(gradable).flatMap((q) => attempts.get(q.id) ?? [])
    const topicId = requireQuiz(round.quizId).topicId
    return {
      round: toRoundView(round),
      masteryThreshold,
      questions: graded.map((attempt) => attemptFeedback(attempt, round.completedAt === null)),
      notionScores: notionScores(graded, notionRefs(topicId)),
      skippedQuestionIds: questions.filter((q) => !gradable(q)).map((q) => q.id)
    }
  }

  const service: QuizService = {
    listTopics() {
      return listTopics(db).map(({ id, slug, title }) => ({
        id,
        slug,
        title,
        quizCount: listQuizzesByTopic(db, id).length
      }))
    },

    listQuizzes(topicId) {
      return listQuizzesByTopic(db, topicId).map((quiz) => {
        const questions = listQuestions(db, quiz.id)
        return {
          id: quiz.id,
          topicId: quiz.topicId,
          createdAt: quiz.createdAt,
          grounded: quiz.grounded,
          questionCount: questions.length,
          gradableQuestionCount: questions.filter(gradable).length
        }
      })
    },

    loadQuiz(quizId) {
      const quiz = requireQuiz(quizId)
      const notions = new Map(notionRefs(quiz.topicId).map((notion) => [notion.id, notion]))
      return {
        id: quiz.id,
        topicId: quiz.topicId,
        topicTitle: getTopic(db, quiz.topicId)?.title ?? '',
        grounded: quiz.grounded,
        questions: listQuestions(db, quiz.id).map((q) => toQuestionView(q, notions))
      }
    },

    startRound(quizId) {
      return db.transaction(() => {
        const quiz = requireQuiz(quizId)
        const round =
          findOpenRound(db, quizId) ??
          createRound(db, {
            topicId: quiz.topicId,
            quizId,
            number: nextRoundNumber(db, quiz.topicId)
          })
        return {
          round: toRoundView(round),
          quiz: service.loadQuiz(quizId),
          answered: [...roundAttempts(round).values()].map((attempt) =>
            attemptFeedback(attempt, true)
          )
        }
      })
    },

    submitAnswer(roundId, submitted) {
      return db.transaction(() => submit(requireOpenRound(roundId), submitted))
    },

    async submitFreeAnswer(roundId, { questionId, answer }, signal) {
      const grader = requireFreeAnswerGrader()
      const round = requireOpenRound(roundId)
      const question = requireQuestionInPlay(round, questionId)
      if (question.type !== 'free_answer') {
        throw new Error(`Question ${questionId} is not a free-answer question.`)
      }
      requireUnanswered(round, questionId)
      const { text } = normalizeFreeAnswer(answer)
      return withGradingLock(round, questionId, async () => {
        const request = gradingRequestFor(round, question)
        const graded = await grader.grade({ ...request, answer: text }, signal)
        return db.transaction(() => {
          // The round may have changed while the Generation ran.
          requireUnanswered(requireOpenRound(roundId), questionId)
          const record: FreeAnswerGradingRecord = { ...graded, contest: null, history: [] }
          recordAttempt(db, {
            questionId,
            roundId,
            answer: { text },
            ...recordGradingResult(record)
          })
          return freeAnswerFeedback(question, text, record, { contestable: true })
        })
      })
    },

    async contestGrade(roundId, questionId, rawJustification, signal) {
      const grader = requireFreeAnswerGrader()
      const round = requireOpenRound(roundId)
      const question = requireQuestionInPlay(round, questionId)
      const justification = rawJustification.trim()
      if (justification.length === 0) throw new InvalidAnswerError('Explain why you contest.')
      if (justification.length > CONTEST_JUSTIFICATION_MAX_LENGTH) {
        throw new InvalidAnswerError(
          `A justification is at most ${CONTEST_JUSTIFICATION_MAX_LENGTH} characters.`
        )
      }
      /** The attempt and its record, checked again after the Generation. */
      const contestable = (current: Round) => {
        const attempt = roundAttempts(current).get(questionId)
        if (!attempt || attempt.questionType !== 'free_answer') {
          throw new Error(`Question ${questionId} has no graded free answer in this round.`)
        }
        const record = parseGradingRecord(attempt.feedback)
        if (record.contest !== null) throw new Error('This grade was already contested.')
        if (record.grading.verdict === 'correct') {
          throw new Error('A correct answer cannot be contested.')
        }
        return { attempt, record }
      }
      const { attempt } = contestable(round)
      const { text } = attempt.answer as { text: string }
      return withGradingLock(round, questionId, async () => {
        const first = contestable(round).record
        const request = gradingRequestFor(round, question)
        const graded = await grader.grade(
          { ...request, answer: text, contest: { justification, previous: first.grading } },
          signal
        )
        return db.transaction(() => {
          const { record } = contestable(requireOpenRound(roundId))
          const contested: FreeAnswerGradingRecord = {
            ...graded,
            contest: { justification, contestedAt: new Date().toISOString() },
            history: [
              ...record.history,
              { promptVersion: record.promptVersion, grading: record.grading }
            ]
          }
          updateAttemptGrading(db, attempt.id, recordGradingResult(contested))
          return freeAnswerFeedback(question, text, contested, { contestable: false })
        })
      })
    },

    completeRound(roundId, answers = []) {
      return db.transaction(() => {
        const round = requireOpenRound(roundId)
        if ([...gradingInProgress].some((key) => key.startsWith(`${round.id}:`))) {
          throw new Error(`Round ${round.number} has an answer being graded.`)
        }
        for (const answer of answers) submit(round, answer)
        const attempts = roundAttempts(round)
        const toGrade = listQuestions(db, round.quizId).filter(gradable)
        if (toGrade.length === 0) throw new Error(`Round ${round.number} has nothing to grade.`)
        const missing = toGrade.filter((question) => !attempts.has(question.id))
        if (missing.length > 0) {
          throw new Error(
            `Round ${round.number} has ${missing.length} unanswered question(s): ${missing.map((q) => q.id).join(', ')}.`
          )
        }
        const scorePercent = quizScorePercent(toGrade.map((q) => attempts.get(q.id)!))
        const { masteryThreshold } = getSettings(db)
        const completed = storeRoundOutcome(db, round.id, {
          scorePercent,
          passed: meetsThreshold(scorePercent, masteryThreshold)
        })
        return result(completed, masteryThreshold)
      })
    },

    getRoundResult(roundId) {
      const round = getRound(db, roundId)
      if (!round) throw new Error(`Round ${roundId} does not exist.`)
      if (round.completedAt === null) throw new Error(`Round ${round.number} is not completed.`)
      return result(round, getSettings(db).masteryThreshold)
    }
  }
  return service
}
