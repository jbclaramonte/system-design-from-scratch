import { app } from 'electron'
import type { IpcHandlers } from './registerHandlers'

export const handlers: IpcHandlers = {
  'app:getVersion': () => app.getVersion(),
  'system:ping': ({ message }) => ({
    reply: `pong: ${message}`,
    receivedAt: new Date().toISOString()
  })
}
