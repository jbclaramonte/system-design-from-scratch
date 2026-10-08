/// <reference types="vite/client" />

import type { Api } from '../../shared/ipc'

declare global {
  interface Window {
    /** Typed IPC bridge exposed by the preload script (see src/shared/ipc.ts). */
    api: Api
  }
}
