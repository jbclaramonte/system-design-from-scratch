import { z } from 'zod'
import type { Database } from '../db'
import { GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import { getQuiz } from '../db/repositories/assessment'
import type { TopicLockGuard } from '../path/lock'
import { createDevQuiz } from '../quiz/devFixture'
import type { QuizService } from '../quiz/service'
import type { IpcRequest, IpcResponse } from '../../shared/ipc'
import type { FreeAnswerGradingOutcome, QuestionFeedback } from '../../shared/quiz'

// The renderer is not trusted to send well-formed requests: validate before use. Answers are
// only checked for shape here; the grader validates them against the question.
const id = z.number().int().positive()
const submittedAnswer = z.object({
  questionId: id,
  answer: z.object({ selected: z.array(z.number()) })
})
const topicRequest = z.object({ topicId: id })
const quizRequest = z.object({ quizId: id })
const roundRequest = z.object({ roundId: id })
const submitRequest = roundRequest.extend(submittedAnswer.shape)
const completeRequest = roundRequest.extend({ answers: z.array(submittedAnswer).optional() })
// Lengths are checked by the service; this cap only bounds what crosses the boundary.
const freeAnswerRequest = roundRequest.extend({
  questionId: id,
  answer: z.object({ text: z.string().max(10_000) })
})
const contestRequest = roundRequest.extend({
  questionId: id,
  justification: z.string().max(10_000)
})
const gradingRequest = roundRequest.extend({ questionId: id })

export interface QuizIpc {
  listTopics(): IpcResponse<'quiz:listTopics'>
  listQuizzes(request: IpcRequest<'quiz:listQuizzes'>): IpcResponse<'quiz:listQuizzes'>
  loadQuiz(request: IpcRequest<'quiz:load'>): IpcResponse<'quiz:load'>
  startRound(request: IpcRequest<'quiz:startRound'>): IpcResponse<'quiz:startRound'>
  submitAnswer(request: IpcRequest<'quiz:submitAnswer'>): IpcResponse<'quiz:submitAnswer'>
  completeRound(request: IpcRequest<'quiz:completeRound'>): IpcResponse<'quiz:completeRound'>
  createDevQuiz(): IpcResponse<'quiz:createDevQuiz'>
  submitFreeAnswer(
    request: IpcRequest<'quiz:submitFreeAnswer'>,
    client: GenerationClient
  ): Promise<IpcResponse<'quiz:submitFreeAnswer'>>
  contestGrade(
    request: IpcRequest<'quiz:contestGrade'>,
    client: GenerationClient
  ): Promise<IpcResponse<'quiz:contestGrade'>>
  cancelGrading(request: IpcRequest<'quiz:cancelGrading'>): void
}

/**
 * Quiz and Round calls over IPC. `allowDevFixture` is false in a packaged app. A Round of a
 * topic locked on the Learning Path is refused (`assertTopicUnlocked`, see `createTopicLockGuard`).
 */
export function createQuizIpc(
  db: Database,
  service: QuizService,
  {
    allowDevFixture,
    assertTopicUnlocked = () => {}
  }: { allowDevFixture: boolean; assertTopicUnlocked?: TopicLockGuard }
): QuizIpc {
  /** Free-answer gradings in progress, by `roundId:questionId`, for `quiz:cancelGrading`. */
  const gradings = new Map<string, AbortController>()

  /**
   * Runs a grading cancellable by `quiz:cancelGrading` or the window closing. A failed
   * Generation is returned as an outcome with its typed error; refusals (completed round,
   * already answered...) are thrown like the other quiz calls.
   */
  async function grading(
    roundId: number,
    questionId: number,
    client: GenerationClient,
    run: (signal: AbortSignal) => Promise<QuestionFeedback>
  ): Promise<FreeAnswerGradingOutcome> {
    const key = `${roundId}:${questionId}`
    const controller = new AbortController()
    const abort = () => controller.abort()
    const own = !gradings.has(key)
    if (own) gradings.set(key, controller)
    client.once('destroyed', abort)
    try {
      return { status: 'graded', feedback: await run(controller.signal) }
    } catch (error) {
      if (error instanceof GenerationError) return { status: 'failed', error: error.toInfo() }
      throw error
    } finally {
      if (own) gradings.delete(key)
      client.removeListener('destroyed', abort)
    }
  }

  return {
    listTopics: () => service.listTopics(),
    listQuizzes: (request) => service.listQuizzes(topicRequest.parse(request).topicId),
    loadQuiz: (request) => service.loadQuiz(quizRequest.parse(request).quizId),
    startRound(request) {
      const { quizId } = quizRequest.parse(request)
      const quiz = getQuiz(db, quizId)
      if (quiz) assertTopicUnlocked(quiz.topicId)
      return service.startRound(quizId)
    },
    submitAnswer(request) {
      const { roundId, questionId, answer } = submitRequest.parse(request)
      return service.submitAnswer(roundId, { questionId, answer })
    },
    completeRound(request) {
      const { roundId, answers } = completeRequest.parse(request)
      return service.completeRound(roundId, answers)
    },
    createDevQuiz() {
      if (!allowDevFixture) throw new Error('The fixture quiz is only available in dev')
      const quizId = createDevQuiz(db)
      const quiz = service.loadQuiz(quizId)
      return { topicId: quiz.topicId, quizId }
    },
    async submitFreeAnswer(request, client) {
      const { roundId, questionId, answer } = freeAnswerRequest.parse(request)
      return grading(roundId, questionId, client, (signal) =>
        service.submitFreeAnswer(roundId, { questionId, answer }, signal)
      )
    },
    async contestGrade(request, client) {
      const { roundId, questionId, justification } = contestRequest.parse(request)
      return grading(roundId, questionId, client, (signal) =>
        service.contestGrade(roundId, questionId, justification, signal)
      )
    },
    cancelGrading(request) {
      const { roundId, questionId } = gradingRequest.parse(request)
      gradings.get(`${roundId}:${questionId}`)?.abort()
    }
  }
}
