/// <reference types="vite/client" />

import type { Api } from '../../shared/ipc'

declare global {
  interface ImportMetaEnv {
    /** tldraw license key, see .env.example. Empty in dev is fine. */
    readonly VITE_TLDRAW_LICENSE_KEY?: string
  }

  interface Window {
    /** Typed IPC bridge exposed by the preload script (see src/shared/ipc.ts). */
    api: Api
  }
}
