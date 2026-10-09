// Settings over IPC: read, validated update (applied at once, no restart), and the Claude CLI
// path test.
import { z } from 'zod'
import type { Database } from '../db'
import { getSettings, updateSettings } from '../db/repositories/settings'
import {
  settingsErrors,
  type AppSettings,
  type CliCheck,
  type CliCheckRequest
} from '../../shared/settings'
import { checkCli } from './checkCli'

// Shape only; the ranges are checked by `settingsErrors`, shared with the Settings screen.
const updateRequest = z
  .object({
    masteryThreshold: z.number(),
    roundLimit: z.number(),
    questionsPerQuiz: z.number().nullable(),
    claudeCliPath: z.string().nullable()
  })
  .partial()
  .strict()
const checkRequest = z.object({ claudeCliPath: z.string().nullable() })

/** An empty path means the automatic lookup. */
const normalizePath = (path: string | null | undefined) =>
  path === undefined ? undefined : path?.trim() || null

export interface SettingsIpc {
  get(): AppSettings
  update(request: Partial<AppSettings>): AppSettings
  testCli(request: CliCheckRequest): Promise<CliCheck>
}

export interface SettingsIpcOptions {
  /** Called when the CLI path setting changes (the Generation service resolves it again). */
  onCliPathChange?: () => void
  /** Path used when the setting is empty (the `CLAUDE_CLI_PATH` environment variable). */
  fallbackCliPath?: string
}

export function createSettingsIpc(db: Database, options: SettingsIpcOptions = {}): SettingsIpc {
  return {
    get: () => getSettings(db),

    update(request) {
      const parsed = updateRequest.parse(request)
      const changes = { ...parsed, claudeCliPath: normalizePath(parsed.claudeCliPath) }
      const errors = Object.values(settingsErrors(changes))
      if (errors.length > 0) throw new Error(`Invalid settings: ${errors.join(' ')}`)
      const before = getSettings(db).claudeCliPath
      const updated = updateSettings(db, changes)
      if (updated.claudeCliPath !== before) options.onCliPathChange?.()
      return updated
    },

    testCli(request) {
      const path = normalizePath(checkRequest.parse(request).claudeCliPath)
      return checkCli({ configuredPath: path ?? options.fallbackCliPath })
    }
  }
}
