// Quiz service: loads a quiz without its answer keys, plays it as a Round, grades each answer in
// the main process, records it as an Attempt tagged with notions, and completes the Round against
// the Mastery Threshold. The Mastery Loop around it (remediation, next round) is #11.
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
  recordAttempt
} from '../db/repositories/assessment'
import { getTopic, listNotionsByTopic, listTopics } from '../db/repositories/learningContent'
import { getSettings } from '../db/repositories/settings'
import type { Attempt, Question, Quiz, Round } from '../db/types'
import type {
  NotionRef,
  QuestionFeedback,
  QuestionView,
  QuizSummary,
  QuizTopic,
  QuizView,
  RoundResult,
  RoundStart,
  RoundView,
  SubmittedAnswer
} from '../../shared/quiz'
import {
  gradeAnswer,
  localGraders,
  meetsThreshold,
  notionScores,
  parseChoiceBody,
  quizScorePercent,
  type Graders
} from './grading'

export interface QuizService {
  listTopics(): QuizTopic[]
  listQuizzes(topicId: number): QuizSummary[]
  loadQuiz(quizId: number): QuizView
  /** Resumes the open round of the quiz, or starts one with the topic's next round number. */
  startRound(quizId: number): RoundStart
  submitAnswer(roundId: number, submitted: SubmittedAnswer): QuestionFeedback
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

/** `graders` defaults to the local ones; #10 adds the free-answer grader. */
export function createQuizService(db: Database, graders: Graders = localGraders): QuizService {
  const gradable = (question: Question) => graders[question.type] !== undefined

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

  /** Feedback of a recorded attempt: the stored grading, with the answer key re-attached. */
  function attemptFeedback(attempt: Attempt): QuestionFeedback {
    const question = getQuestion(db, attempt.questionId)!
    const { feedback } = gradeAnswer(question, attempt.answer, graders)
    return { ...feedback, result: attempt.result, score: attempt.score, feedback: attempt.feedback }
  }

  /** Attempts of the round on the questions in play, by question id. */
  function roundAttempts(round: Round): Map<number, Attempt> {
    return new Map(listAttemptsByRound(db, round.id).map((a) => [a.questionId, a]))
  }

  function submit(round: Round, { questionId, answer }: SubmittedAnswer): QuestionFeedback {
    const question = getQuestion(db, questionId)
    if (!question || question.quizId !== round.quizId) {
      throw new Error(`Question ${questionId} is not part of round ${round.number}.`)
    }
    if (question.replacedByQuestionId !== null) {
      throw new Error(`Question ${questionId} was replaced.`)
    }
    if (roundAttempts(round).has(questionId)) {
      throw new Error(`Question ${questionId} is already answered in round ${round.number}.`)
    }
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
      questions: graded.map(attemptFeedback),
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
          answered: [...roundAttempts(round).values()].map(attemptFeedback)
        }
      })
    },

    submitAnswer(roundId, submitted) {
      return db.transaction(() => submit(requireOpenRound(roundId), submitted))
    },

    completeRound(roundId, answers = []) {
      return db.transaction(() => {
        const round = requireOpenRound(roundId)
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
