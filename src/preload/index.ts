import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { createApi } from '../shared/ipc'

contextBridge.exposeInMainWorld(
  'api',
  createApi(
    (channel, request) => ipcRenderer.invoke(channel, request),
    (channel, listener) => {
      // Never hand the IpcRendererEvent (and its sender) to the renderer.
      const wrapped = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
      ipcRenderer.on(channel, wrapped)
      return () => {
        ipcRenderer.removeListener(channel, wrapped)
      }
    }
  )
)
