// Shared by scripts/check-tldraw-key.mjs and scripts/check-package.mjs: the tldraw license key as
// the renderer build sees it. Resolved with Vite's own loadEnv in production mode (what
// `electron-vite build` uses), so the precedence is the real one: a VITE_TLDRAW_LICENSE_KEY set in
// the shell wins over .env.local, which wins over .env; an empty value counts as no key.
// The value is returned to callers that must compare it with a build; it is never printed here.
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

export const LICENSE_KEY_VARIABLE = 'VITE_TLDRAW_LICENSE_KEY'

const root = resolve(import.meta.dirname, '..')

/** The trimmed key (what the renderer is built with), or '' when missing or empty. */
export function readTldrawLicenseKey() {
  return (loadEnv('production', root, 'VITE_')[LICENSE_KEY_VARIABLE] ?? '').trim()
}
