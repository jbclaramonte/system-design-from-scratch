import { z } from 'zod'
import { generationKinds } from '../../shared/generation'
import type { GenerationCancelRequest, GenerationStartRequest } from '../../shared/ipc'
import { sendEvent, type IpcEventTarget } from '../ipc/sendEvent'
import { buildPlaceholderGeneration } from './placeholderPrompts'
import type { GenerationService } from './service'

/** A renderer that receives Generation events (a `WebContents`). */
export interface GenerationClient extends IpcEventTarget {
  once(event: 'destroyed', listener: () => void): unknown
  removeListener(event: 'destroyed', listener: () => void): unknown
}

// The renderer is not trusted to send well-formed requests: validate before use.
const startRequestSchema = z.object({
  requestId: z.string().min(1).max(100),
  kind: z.enum(generationKinds),
  input: z.json(),
  priority: z.enum(['foreground', 'background']).optional()
})

const cancelRequestSchema = z.object({ requestId: z.string() })

export interface GenerationIpc {
  start(request: GenerationStartRequest, client: GenerationClient): void
  cancel(request: GenerationCancelRequest): void
}

/**
 * Bridges `generation:start` / `generation:cancel` to the service and streams every event back
 * on `generation:event`, tagged with the request id. Runs of a closed window are cancelled.
 */
export function createGenerationIpc(service: GenerationService): GenerationIpc {
  const runs = new Map<string, AbortController>()

  return {
    start(request, client) {
      const { requestId, kind, input, priority } = startRequestSchema.parse(request)
      if (runs.has(requestId)) throw new Error(`Generation ${requestId} is already running.`)

      const controller = new AbortController()
      runs.set(requestId, controller)
      const abort = () => controller.abort()
      client.once('destroyed', abort)

      // PLACEHOLDER (issue #7): the real prompt builders and schemas replace this call.
      const run = service.generate({
        kind,
        input,
        ...buildPlaceholderGeneration(kind, input),
        priority,
        signal: controller.signal
      })

      void (async () => {
        for await (const event of run.events) {
          sendEvent(client, 'generation:event', { requestId, event })
        }
        runs.delete(requestId)
        client.removeListener('destroyed', abort)
      })()
    },

    cancel(request) {
      runs.get(cancelRequestSchema.parse(request).requestId)?.abort()
    }
  }
}
