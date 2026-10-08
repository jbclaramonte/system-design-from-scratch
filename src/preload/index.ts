import { contextBridge, ipcRenderer } from 'electron'
import { createApi } from '../shared/ipc'

contextBridge.exposeInMainWorld(
  'api',
  createApi((channel, request) => ipcRenderer.invoke(channel, request))
)
