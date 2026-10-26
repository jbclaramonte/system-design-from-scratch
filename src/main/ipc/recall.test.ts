import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { GenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import type { RecallService } from '../recall/service'
import type { RecallStart } from '../../shared/recall'
import { createRecallIpc } from './recall'

/** A window: `destroy()` closes it. */
const fakeClient = () => {
  const emitter = new EventEmitter()
  const client: GenerationClient & { destroy(): void } = {
    send: () => {},
    isDestroyed: () => false,
    once: (event, listener) => emitter.once(event, listener),
    removeListener: (event, listener) => emitter.removeListener(event, listener),
    destroy: () => emitter.emit('destroyed')
  }
  return client
}

const start = { session: { id: 1 }, questions: [], answered: [] } as unknown as RecallStart

function stubService(overrides: Partial<RecallService> = {}): RecallService {
  return {
    prepareGate: vi.fn(() => start),
    startPractice: vi.fn(() => start),
    submitAnswer: vi.fn(),
    complete: vi.fn(),
    clarifyQuestion: vi.fn(),
    getMemoryReview: vi.fn(),
    ...overrides
  } as RecallService
}

const ipc = (service: RecallService) => createRecallIpc(service, { log: () => {} })

describe('createRecallIpc', () => {
  it('forwards valid requests to the service', () => {
    const service = stubService()
    const recall = ipc(service)

    expect(recall.prepareGate({ topicId: 4 })).toBe(start)
    expect(recall.startPractice({ notionIds: [1, 2] })).toBe(start)
    expect(recall.startPractice({})).toBe(start)
    recall.submitAnswer({ sessionId: 1, questionId: 2, answer: { selected: [0] } })
    recall.complete({ sessionId: 1 })
    recall.getMemoryReview()

    expect(service.prepareGate).toHaveBeenCalledWith(4)
    expect(service.startPractice).toHaveBeenNthCalledWith(1, [1, 2])
    expect(service.startPractice).toHaveBeenNthCalledWith(2, undefined)
    expect(service.submitAnswer).toHaveBeenCalledWith(1, {
      questionId: 2,
      answer: { selected: [0] }
    })
    expect(service.complete).toHaveBeenCalledWith(1)
    expect(service.getMemoryReview).toHaveBeenCalled()
  })

  it('validates every request: a non-positive id and an unknown key are refused', async () => {
    const service = stubService()
    const recall = ipc(service)
    const client = fakeClient()

    expect(() => recall.prepareGate({ topicId: 0 })).toThrow()
    expect(() => recall.prepareGate({ topicId: 1, extra: true } as never)).toThrow()
    expect(() => recall.startPractice({ notionIds: [-1] })).toThrow()
    expect(() => recall.startPractice({ notionIds: [1], extra: 1 } as never)).toThrow()
    expect(() =>
      recall.submitAnswer({ sessionId: 1, questionId: 1.5, answer: { selected: [0] } })
    ).toThrow()
    expect(() =>
      recall.submitAnswer({ sessionId: 1, questionId: 1, answer: { selected: ['0'] } } as never)
    ).toThrow()
    expect(() => recall.complete({ sessionId: -2 })).toThrow()
    expect(() => recall.cancelClarification({ sessionId: 1, questionId: 0 })).toThrow()
    await expect(recall.clarifyQuestion({ sessionId: 0, questionId: 1 }, client)).rejects.toThrow()
    await expect(
      recall.clarifyQuestion({ sessionId: 1, questionId: 1, nope: 1 } as never, client)
    ).rejects.toThrow()

    expect(service.prepareGate).not.toHaveBeenCalled()
    expect(service.startPractice).not.toHaveBeenCalled()
    expect(service.submitAnswer).not.toHaveBeenCalled()
    expect(service.complete).not.toHaveBeenCalled()
    expect(service.clarifyQuestion).not.toHaveBeenCalled()
  })

  it('returns null, not a rejection, when preparing the gate fails', () => {
    const log = vi.fn()
    const failing = stubService({
      prepareGate: () => {
        throw new Error('database is locked')
      }
    })

    expect(createRecallIpc(failing, { log }).prepareGate({ topicId: 1 })).toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('gate'), expect.any(Error))
  })

  it('still refuses a malformed gate request instead of hiding it', () => {
    expect(() => ipc(stubService()).prepareGate({ topicId: 'x' } as never)).toThrow()
  })

  it('lets the other calls throw their refusals', () => {
    const recall = ipc(
      stubService({
        submitAnswer: () => {
          throw new Error('already answered')
        }
      })
    )

    expect(() =>
      recall.submitAnswer({ sessionId: 1, questionId: 1, answer: { selected: [0] } })
    ).toThrow('already answered')
  })

  describe('clarification', () => {
    it('returns the clarification as an outcome', async () => {
      const clarify = vi.fn(async () => ({
        clarification: { rewording: 'Reworded', example: 'Example' },
        fromCache: true
      }))
      const recall = ipc(stubService({ clarifyQuestion: clarify }))

      const outcome = await recall.clarifyQuestion(
        { sessionId: 1, questionId: 2, another: true },
        fakeClient()
      )

      expect(outcome).toEqual({
        status: 'clarified',
        clarification: { rewording: 'Reworded', example: 'Example' },
        fromCache: true
      })
      expect(clarify).toHaveBeenCalledWith(1, 2, { another: true, signal: expect.any(AbortSignal) })
    })

    it('returns a failed Generation as an outcome with its typed error', async () => {
      const recall = ipc(
        stubService({
          clarifyQuestion: async () => {
            throw new GenerationError('cli_not_found')
          }
        })
      )

      const outcome = await recall.clarifyQuestion({ sessionId: 1, questionId: 2 }, fakeClient())

      expect(outcome).toMatchObject({ status: 'failed', error: { code: 'cli_not_found' } })
    })

    it('throws refusals that are not Generation errors', async () => {
      const recall = ipc(
        stubService({
          clarifyQuestion: async () => {
            throw new Error('Question 2 is already answered.')
          }
        })
      )

      await expect(
        recall.clarifyQuestion({ sessionId: 1, questionId: 2 }, fakeClient())
      ).rejects.toThrow('already answered')
    })

    /** A clarification that stays pending until its signal aborts. */
    const holding = () => {
      let signal: AbortSignal | undefined
      const clarify = vi.fn(
        (_sessionId: number, _questionId: number, options?: { signal?: AbortSignal }) => {
          signal = options?.signal
          return new Promise<never>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
          })
        }
      )
      return { clarify, aborted: () => signal?.aborted ?? false }
    }

    it('is cancelled by cancelClarification for its session and question', async () => {
      const held = holding()
      const recall = ipc(stubService({ clarifyQuestion: held.clarify }))
      const pending = recall.clarifyQuestion({ sessionId: 1, questionId: 2 }, fakeClient())

      recall.cancelClarification({ sessionId: 1, questionId: 3 })
      expect(held.aborted()).toBe(false)
      recall.cancelClarification({ sessionId: 1, questionId: 2 })

      expect(held.aborted()).toBe(true)
      await expect(pending).resolves.toMatchObject({
        status: 'failed',
        error: { code: 'cancelled' }
      })
    })

    it('is cancelled when the window is destroyed', async () => {
      const held = holding()
      const recall = ipc(stubService({ clarifyQuestion: held.clarify }))
      const client = fakeClient()
      const pending = recall.clarifyQuestion({ sessionId: 1, questionId: 2 }, client)

      client.destroy()

      expect(held.aborted()).toBe(true)
      await expect(pending).resolves.toMatchObject({ status: 'failed' })
    })
  })
})
