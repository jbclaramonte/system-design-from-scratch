import { app } from 'electron'
import type { GenerationIpc } from '../generation/ipc'
import type { DesignIpc } from './design'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  generation: GenerationIpc
  design: DesignIpc
}

export function createHandlers({ generation, design }: HandlerDependencies): IpcHandlers {
  return {
    'app:getVersion': () => app.getVersion(),
    'system:ping': ({ message }) => ({
      reply: `pong: ${message}`,
      receivedAt: new Date().toISOString()
    }),
    'generation:start': (request, event) => generation.start(request, event.sender),
    'generation:cancel': (request) => generation.cancel(request),
    'design:loadScene': (request) => design.loadScene(request),
    'design:saveScene': (request) => design.saveScene(request),
    'design:openScratchExercise': () => design.openScratchExercise()
  }
}
