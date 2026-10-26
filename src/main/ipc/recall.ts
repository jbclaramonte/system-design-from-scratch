import { z } from 'zod'
import { GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import type { RecallService } from '../recall/service'
import type { IpcRequest, IpcResponse } from '../../shared/ipc'
import type { QuestionClarificationOutcome } from '../../shared/quiz'

// The renderer is not trusted to send well-formed requests: validate before use, and refuse keys
// that are not part of the request. Answers are only checked for shape here; the grader validates
// them against the question.
const id = z.number().int().positive()
const gateRequest = z.object({ topicId: id }).strict()
const practiceRequest = z.object({ notionIds: z.array(id).max(1000).optional() }).strict()
const sessionRequest = z.object({ sessionId: id }).strict()
const submitRequest = z
  .object({
    sessionId: id,
    questionId: id,
    answer: z.object({ selected: z.array(z.number()) })
  })
  .strict()
const questionRequest = z.object({ sessionId: id, questionId: id }).strict()
const clarifyRequest = z
  .object({ sessionId: id, questionId: id, another: z.boolean().optional() })
  .strict()

export interface RecallIpc {
  prepareGate(request: IpcRequest<'recall:prepareGate'>): IpcResponse<'recall:prepareGate'>
  startPractice(request: IpcRequest<'recall:startPractice'>): IpcResponse<'recall:startPractice'>
  submitAnswer(request: IpcRequest<'recall:submitAnswer'>): IpcResponse<'recall:submitAnswer'>
  complete(request: IpcRequest<'recall:complete'>): IpcResponse<'recall:complete'>
  clarifyQuestion(
    request: IpcRequest<'recall:clarifyQuestion'>,
    client: GenerationClient
  ): Promise<IpcResponse<'recall:clarifyQuestion'>>
  cancelClarification(request: IpcRequest<'recall:cancelClarification'>): void
  getMemoryReview(): IpcResponse<'recall:getMemoryReview'>
}

/**
 * Recall Quiz and Memory Review calls over IPC. A Recall Quiz never blocks the Learning Path: a
 * failure while preparing the gate is logged and returns null, so the Lesson opens. Recall calls
 * are not guarded by the Learning Path lock and notify nothing: they change no mastery.
 */
export function createRecallIpc(
  service: RecallService,
  {
    log = (message, error) => console.error(message, error)
  }: {
    log?: (message: string, error: unknown) => void
  } = {}
): RecallIpc {
  /** Clarifications in progress, by `sessionId:questionId`, for `recall:cancelClarification`. */
  const clarifications = new Map<string, AbortController>()

  return {
    prepareGate(request) {
      // A malformed request is a bug of the renderer, not a technical failure: it still throws.
      const { topicId } = gateRequest.parse(request)
      try {
        return service.prepareGate(topicId)
      } catch (error) {
        log('Could not prepare the Recall Quiz gate; the Lesson opens without it', error)
        return null
      }
    },
    startPractice(request) {
      return service.startPractice(practiceRequest.parse(request).notionIds)
    },
    submitAnswer(request) {
      const { sessionId, questionId, answer } = submitRequest.parse(request)
      return service.submitAnswer(sessionId, { questionId, answer })
    },
    complete(request) {
      return service.complete(sessionRequest.parse(request).sessionId)
    },
    async clarifyQuestion(request, client) {
      const { sessionId, questionId, another } = clarifyRequest.parse(request)
      const key = `${sessionId}:${questionId}`
      const controller = new AbortController()
      const abort = () => controller.abort()
      const own = !clarifications.has(key)
      if (own) clarifications.set(key, controller)
      client.once('destroyed', abort)
      try {
        const { clarification, fromCache } = await service.clarifyQuestion(sessionId, questionId, {
          another,
          signal: controller.signal
        })
        const outcome: QuestionClarificationOutcome = {
          status: 'clarified',
          clarification,
          fromCache
        }
        return outcome
      } catch (error) {
        if (error instanceof GenerationError) return { status: 'failed', error: error.toInfo() }
        throw error
      } finally {
        if (own) clarifications.delete(key)
        client.removeListener('destroyed', abort)
      }
    },
    cancelClarification(request) {
      const { sessionId, questionId } = questionRequest.parse(request)
      clarifications.get(`${sessionId}:${questionId}`)?.abort()
    },
    getMemoryReview: () => service.getMemoryReview()
  }
}
