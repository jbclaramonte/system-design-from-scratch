// Settings over IPC: read, validated update (applied at once, no restart), and the Claude CLI
// test (path, version, login state of the profile).
import { statSync } from 'node:fs'
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
    claudeCliPath: z.string().nullable(),
    claudeConfigDir: z.string().nullable()
  })
  .partial()
  .strict()
const checkRequest = z.object({
  claudeCliPath: z.string().nullable(),
  claudeConfigDir: z.string().nullable()
})

/** An empty path means the automatic lookup (CLI path) or the inherited environment (config dir). */
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

const isDirectory = (path: string) => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function createSettingsIpc(db: Database, options: SettingsIpcOptions = {}): SettingsIpc {
  return {
    get: () => getSettings(db),

    update(request) {
      const parsed = updateRequest.parse(request)
      const changes = {
        ...parsed,
        claudeCliPath: normalizePath(parsed.claudeCliPath),
        claudeConfigDir: normalizePath(parsed.claudeConfigDir)
      }
      const errors = Object.values(settingsErrors(changes))
      if (changes.claudeConfigDir && errors.length === 0 && !isDirectory(changes.claudeConfigDir)) {
        errors.push(
          `Claude config directory ${changes.claudeConfigDir} is not an existing directory.`
        )
      }
      if (errors.length > 0) throw new Error(`Invalid settings: ${errors.join(' ')}`)
      const before = getSettings(db).claudeCliPath
      const updated = updateSettings(db, changes)
      if (updated.claudeCliPath !== before) options.onCliPathChange?.()
      return updated
    },

    testCli(request) {
      const parsed = checkRequest.parse(request)
      const path = normalizePath(parsed.claudeCliPath)
      const configDir = normalizePath(parsed.claudeConfigDir)
      if (configDir && !isDirectory(configDir)) {
        const message = `Claude config directory ${configDir} is not an existing directory.`
        return Promise.resolve({ ok: false, error: { code: 'unknown', message } })
      }
      return checkCli({ configuredPath: path ?? options.fallbackCliPath, configDir })
    }
  }
}
