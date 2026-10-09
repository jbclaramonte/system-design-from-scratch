/**
 * Single source of truth for the IPC boundary between the renderer and the main process.
 *
 * To add a call: declare its channel in `IpcChannels`, map a `window.api` method to it in
 * `apiChannels`, then implement the handler in `src/main/ipc/handlers.ts` (the compiler
 * rejects a missing handler).
 *
 * To add an event pushed by the main process: declare it in `IpcEvents` and map a `window.api`
 * subscription method to it in `apiEvents`; the main process sends it with `sendEvent`.
 */

import type { GenerationEvent, GenerationKind, GenerationPriority, Json } from './generation'

/** The fields of a Design Exercise the renderer needs to open its Design Canvas. */
export interface DesignExerciseRef {
  id: number
  slug: string
  title: string
}

export interface DesignSceneLoadRequest {
  designExerciseId: number
}

export interface DesignSceneSaveRequest {
  designExerciseId: number
  /** tldraw editor snapshot, see `src/renderer/src/design/sceneSnapshot.ts`. */
  snapshot: Json
}

export interface PingRequest {
  message: string
}

export interface PingResponse {
  reply: string
  receivedAt: string
}

export interface GenerationStartRequest {
  /**
   * Chosen by the renderer (`crypto.randomUUID()`), so it can match events that arrive before
   * the call returns.
   */
  requestId: string
  kind: GenerationKind
  input: Json
  /** Default `foreground`. */
  priority?: GenerationPriority
}

export interface GenerationCancelRequest {
  requestId: string
}

/** One Generation event, tagged with the request it belongs to. */
export interface GenerationStreamEvent {
  requestId: string
  event: GenerationEvent
}

/** Channel name to request and response types. Channel names are `domain:action`. */
export interface IpcChannels {
  'app:getVersion': { request: void; response: string }
  'system:ping': { request: PingRequest; response: PingResponse }
  /** Starts a Generation; its events follow on `generation:event`. */
  'generation:start': { request: GenerationStartRequest; response: void }
  'generation:cancel': { request: GenerationCancelRequest; response: void }
  /** Stored Design Scene snapshot of the exercise, or `null` when it has none yet. */
  'design:loadScene': { request: DesignSceneLoadRequest; response: Json | null }
  'design:saveScene': { request: DesignSceneSaveRequest; response: void }
  /** Dev only (rejected in a packaged app): gets or creates the scratch Design Exercise. */
  'design:openScratchExercise': { request: void; response: DesignExerciseRef }
}

/** Event channel (main to renderer) to payload type. */
export interface IpcEvents {
  'generation:event': GenerationStreamEvent
}

export type IpcEventChannel = keyof IpcEvents

export type IpcChannel = keyof IpcChannels
export type IpcRequest<C extends IpcChannel> = IpcChannels[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcChannels[C]['response']

/** `window.api` method name to channel. */
export const apiChannels = {
  getAppVersion: 'app:getVersion',
  ping: 'system:ping',
  startGeneration: 'generation:start',
  cancelGeneration: 'generation:cancel',
  loadDesignScene: 'design:loadScene',
  saveDesignScene: 'design:saveScene',
  openScratchDesignExercise: 'design:openScratchExercise'
} as const satisfies Record<string, IpcChannel>

/** `window.api` subscription method to event channel. */
export const apiEvents = {
  onGenerationEvent: 'generation:event'
} as const satisfies Record<string, IpcEventChannel>

type ApiChannels = typeof apiChannels
type ApiEvents = typeof apiEvents

type ApiMethod<C extends IpcChannel> = [IpcRequest<C>] extends [void]
  ? () => Promise<IpcResponse<C>>
  : (request: IpcRequest<C>) => Promise<IpcResponse<C>>

/** Subscribes a listener and returns the function that unsubscribes it. */
type ApiSubscription<C extends IpcEventChannel> = (
  listener: (payload: IpcEvents[C]) => void
) => () => void

/** Shape of `window.api`, derived from the contract. */
export type Api = { [M in keyof ApiChannels]: ApiMethod<ApiChannels[M]> } & {
  [M in keyof ApiEvents]: ApiSubscription<ApiEvents[M]>
}

export type Invoke = (channel: IpcChannel, request?: unknown) => Promise<unknown>
export type Subscribe = (
  channel: IpcEventChannel,
  listener: (payload: unknown) => void
) => () => void

/**
 * Builds `window.api` on top of a transport (`ipcRenderer.invoke` and `ipcRenderer.on` in the
 * preload).
 */
export function createApi(invoke: Invoke, subscribe: Subscribe): Api {
  const api: Record<string, unknown> = {}
  for (const [method, channel] of Object.entries(apiChannels)) {
    api[method] = (request: unknown) => invoke(channel, request)
  }
  for (const [method, channel] of Object.entries(apiEvents)) {
    api[method] = (listener: (payload: unknown) => void) => subscribe(channel, listener)
  }
  return api as Api
}
