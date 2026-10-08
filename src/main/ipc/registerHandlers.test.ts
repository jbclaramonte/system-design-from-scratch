import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { createApi } from '../../shared/ipc'
import { registerHandlers, type IpcHandlers, type IpcMainLike } from './registerHandlers'

type Listener = (event: IpcMainInvokeEvent, request: unknown) => unknown

function fakeIpcMain(): IpcMainLike & { listeners: Map<string, Listener> } {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    handle(channel, listener) {
      listeners.set(channel, listener)
    }
  }
}

const handlers: IpcHandlers = {
  'app:getVersion': () => '1.2.3',
  'system:ping': ({ message }) => ({ reply: `pong: ${message}`, receivedAt: 'now' })
}

describe('registerHandlers', () => {
  it('registers one listener per channel', () => {
    const ipc = fakeIpcMain()

    registerHandlers(ipc, handlers)

    expect([...ipc.listeners.keys()].sort()).toEqual(['app:getVersion', 'system:ping'])
  })

  it('round-trips a typed call from createApi to the handler', async () => {
    const ipc = fakeIpcMain()
    registerHandlers(ipc, handlers)
    const event = {} as IpcMainInvokeEvent
    const api = createApi(async (channel, request) => ipc.listeners.get(channel)?.(event, request))

    await expect(api.getAppVersion()).resolves.toBe('1.2.3')
    await expect(api.ping({ message: 'hello' })).resolves.toEqual({
      reply: 'pong: hello',
      receivedAt: 'now'
    })
  })
})
