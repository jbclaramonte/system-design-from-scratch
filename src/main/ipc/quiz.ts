import { z } from 'zod'
import type { Database } from '../db'
import { createDevQuiz } from '../quiz/devFixture'
import type { QuizService } from '../quiz/service'
import type { IpcRequest, IpcResponse } from '../../shared/ipc'

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

export interface QuizIpc {
  listTopics(): IpcResponse<'quiz:listTopics'>
  listQuizzes(request: IpcRequest<'quiz:listQuizzes'>): IpcResponse<'quiz:listQuizzes'>
  loadQuiz(request: IpcRequest<'quiz:load'>): IpcResponse<'quiz:load'>
  startRound(request: IpcRequest<'quiz:startRound'>): IpcResponse<'quiz:startRound'>
  submitAnswer(request: IpcRequest<'quiz:submitAnswer'>): IpcResponse<'quiz:submitAnswer'>
  completeRound(request: IpcRequest<'quiz:completeRound'>): IpcResponse<'quiz:completeRound'>
  createDevQuiz(): IpcResponse<'quiz:createDevQuiz'>
}

/** Quiz and Round calls over IPC. `allowDevFixture` is false in a packaged app. */
export function createQuizIpc(
  db: Database,
  service: QuizService,
  { allowDevFixture }: { allowDevFixture: boolean }
): QuizIpc {
  return {
    listTopics: () => service.listTopics(),
    listQuizzes: (request) => service.listQuizzes(topicRequest.parse(request).topicId),
    loadQuiz: (request) => service.loadQuiz(quizRequest.parse(request).quizId),
    startRound: (request) => service.startRound(quizRequest.parse(request).quizId),
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
    }
  }
}
