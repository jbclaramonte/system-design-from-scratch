/**
 * Single source of truth for the IPC boundary between the renderer and the main process.
 *
 * To add a call: declare its channel in `IpcChannels`, map a `window.api` method to it in
 * `apiChannels`, then implement the handler in `src/main/ipc/handlers.ts` (the compiler
 * rejects a missing handler).
 */

export interface PingRequest {
  message: string
}

export interface PingResponse {
  reply: string
  receivedAt: string
}

/** Channel name to request and response types. Channel names are `domain:action`. */
export interface IpcChannels {
  'app:getVersion': { request: void; response: string }
  'system:ping': { request: PingRequest; response: PingResponse }
}

export type IpcChannel = keyof IpcChannels
export type IpcRequest<C extends IpcChannel> = IpcChannels[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcChannels[C]['response']

/** `window.api` method name to channel. */
export const apiChannels = {
  getAppVersion: 'app:getVersion',
  ping: 'system:ping'
} as const satisfies Record<string, IpcChannel>

type ApiChannels = typeof apiChannels

type ApiMethod<C extends IpcChannel> = [IpcRequest<C>] extends [void]
  ? () => Promise<IpcResponse<C>>
  : (request: IpcRequest<C>) => Promise<IpcResponse<C>>

/** Shape of `window.api`, derived from the contract. */
export type Api = { [M in keyof ApiChannels]: ApiMethod<ApiChannels[M]> }

export type Invoke = (channel: IpcChannel, request?: unknown) => Promise<unknown>

/** Builds `window.api` on top of a transport (`ipcRenderer.invoke` in the preload). */
export function createApi(invoke: Invoke): Api {
  const api: Record<string, (request?: unknown) => Promise<unknown>> = {}
  for (const [method, channel] of Object.entries(apiChannels)) {
    api[method] = (request) => invoke(channel, request)
  }
  return api as Api
}
