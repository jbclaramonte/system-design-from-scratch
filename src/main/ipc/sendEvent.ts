import type { IpcEventChannel, IpcEvents } from '../../shared/ipc'

/** The subset of `WebContents` used to push events, so callers can be tested without Electron. */
export interface IpcEventTarget {
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

/** Sends a typed event to a renderer, unless its window is gone. */
export function sendEvent<C extends IpcEventChannel>(
  target: IpcEventTarget,
  channel: C,
  payload: IpcEvents[C]
): void {
  if (!target.isDestroyed()) target.send(channel, payload)
}
