import type { IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '../../shared/ipc'

export type IpcHandler<C extends IpcChannel> = (
  request: IpcRequest<C>,
  event: IpcMainInvokeEvent
) => IpcResponse<C> | Promise<IpcResponse<C>>

/** One handler per channel: a channel without a handler is a compile error. */
export type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> }

/** The subset of `ipcMain` used here, so the helper can be tested without Electron. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, request: unknown) => unknown): void
}

export function registerHandlers(ipc: IpcMainLike, handlers: IpcHandlers): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    const handler = handlers[channel] as (request: unknown, event: IpcMainInvokeEvent) => unknown
    ipc.handle(channel, (event, request) => handler(request, event))
  }
}
