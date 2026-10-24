import { DEFAULT_DAILY_GOAL_ROUNDS } from '../../../shared/activity'
import {
  DEFAULT_GENERATION_LANGUAGE,
  isGenerationLanguage,
  type GenerationLanguage
} from '../../../shared/generationLanguage'
import { DEFAULT_THEME, isTheme, type Theme } from '../../../shared/theme'
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
  checkForUpdatesAtLaunch: 'check_for_updates_at_launch',
  theme: 'theme',
  dailyGoalRounds: 'daily_goal_rounds'
} as const satisfies Record<keyof Settings, string>

/**
 * Defaults of settings added without a migration (the table is key/value): read until the first
 * save writes the row.
 */
const unseededDefaults: Partial<Settings> = {
  claudeConfigDir: null,
  checkForUpdatesAtLaunch: true,
  theme: DEFAULT_THEME,
  dailyGoalRounds: DEFAULT_DAILY_GOAL_ROUNDS
}

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

/** The Theme setting; an unknown stored value reads as the default (System). */
export function getTheme(db: Database): Theme {
  const { theme } = getSettings(db)
  return isTheme(theme) ? theme : DEFAULT_THEME
}

/**
 * The "language chosen" marker (key/value row, not part of the Settings screen): set by the
 * first-run choice, and by migration 9 for an install that predates it. A fresh data folder has
 * no marker, which is what shows the first-run screen. Distinct from the setting itself, whose
 * default (French) is a valid value before any choice.
 */
const LANGUAGE_CHOSEN_KEY = 'generation_language_chosen'

export function isGenerationLanguageChosen(db: Database): boolean {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = $key')
    .get<{ value: string }>({ key: LANGUAGE_CHOSEN_KEY })
  return row?.value === 'true'
}

/**
 * The first-run choice: the setting and the marker in one transaction. Returns false and changes
 * nothing when the language was already chosen (the choice is made once; Settings changes it).
 */
export function chooseGenerationLanguage(db: Database, language: GenerationLanguage): boolean {
  return db.transaction(() => {
    if (isGenerationLanguageChosen(db)) return false
    updateSettings(db, { generationLanguage: language })
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ($key, 'true')
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`
    ).run({ key: LANGUAGE_CHOSEN_KEY })
    return true
  })
}
