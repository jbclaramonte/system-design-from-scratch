import { app } from 'electron'
import type { GenerationIpc } from '../generation/ipc'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  generation: GenerationIpc
}

export function createHandlers({ generation }: HandlerDependencies): IpcHandlers {
  return {
    'app:getVersion': () => app.getVersion(),
    'system:ping': ({ message }) => ({
      reply: `pong: ${message}`,
      receivedAt: new Date().toISOString()
    }),
    'generation:start': (request, event) => generation.start(request, event.sender),
    'generation:cancel': (request) => generation.cancel(request)
  }
}
