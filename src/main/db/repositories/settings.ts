import {
  DEFAULT_GENERATION_LANGUAGE,
  isGenerationLanguage,
  type GenerationLanguage
} from '../../../shared/generationLanguage'
import type { Database } from '../driver'
import type { Settings } from '../types'
import { NOW } from './mapping'

/** Settings field to its key in the `settings` table. Defaults are seeded by the migrations. */
const settingKeys = {
  masteryThreshold: 'mastery_threshold',
  roundLimit: 'round_limit',
  questionsPerQuiz: 'questions_per_quiz',
  claudeCliPath: 'claude_cli_path',
  claudeConfigDir: 'claude_config_dir',
  generationLanguage: 'generation_language',
  checkForUpdatesAtLaunch: 'check_for_updates_at_launch'
} as const satisfies Record<keyof Settings, string>

/**
 * Defaults of settings added without a migration (the table is key/value): read until the first
 * save writes the row.
 */
const unseededDefaults: Partial<Settings> = { claudeConfigDir: null, checkForUpdatesAtLaunch: true }

export function getSettings(db: Database): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const values = new Map(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]))
  const settings = {} as Record<keyof Settings, unknown>
  for (const [field, key] of Object.entries(settingKeys) as [keyof Settings, string][]) {
    if (values.has(key)) settings[field] = values.get(key)
    else if (field in unseededDefaults) settings[field] = unseededDefaults[field]
    else throw new Error(`Missing setting ${key}.`)
  }
  return settings as Settings
}

export function updateSettings(db: Database, changes: Partial<Settings>): Settings {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES ($key, $value)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`
  )
  db.transaction(() => {
    for (const [field, value] of Object.entries(changes) as [keyof Settings, unknown][]) {
      if (value === undefined) continue
      upsert.run({ key: settingKeys[field], value: JSON.stringify(value) })
    }
  })
  return getSettings(db)
}

/** The Generation Language setting: what the next Generation is written in. */
export function getGenerationLanguage(db: Database): GenerationLanguage {
  const { generationLanguage } = getSettings(db)
  return isGenerationLanguage(generationLanguage) ? generationLanguage : DEFAULT_GENERATION_LANGUAGE
}
