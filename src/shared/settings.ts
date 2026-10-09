/**
 * App settings shared by the main process (stored in the `settings` table) and the Settings
 * screen. Validation lives here so both sides apply the same rules.
 */
import type { GenerationErrorInfo } from './generation'

export interface AppSettings {
  /** Mastery Threshold in percent, 50 to 100 (default 100). */
  masteryThreshold: number
  /** Round Limit: completed rounds without success before another angle or a skip is offered. */
  roundLimit: number
  /** Questions per quiz; null = automatic, max(6, targeted notions). */
  questionsPerQuiz: number | null
  /** Absolute path of the `claude` binary; null = automatic lookup. */
  claudeCliPath: string | null
}

export const settingsLimits = {
  masteryThreshold: { min: 50, max: 100 },
  roundLimit: { min: 1, max: 10 },
  questionsPerQuiz: { min: 4, max: 20 }
} as const

export type SettingsErrors = Partial<Record<keyof AppSettings, string>>

const inRange = (value: unknown, { min, max }: { min: number; max: number }) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** Validation errors of a settings change, by field; empty when valid. */
export function settingsErrors(changes: Partial<AppSettings>): SettingsErrors {
  const errors: SettingsErrors = {}
  const { masteryThreshold, roundLimit, questionsPerQuiz, claudeCliPath } = changes
  if (
    masteryThreshold !== undefined &&
    !inRange(masteryThreshold, settingsLimits.masteryThreshold)
  ) {
    errors.masteryThreshold = 'A whole percent between 50 and 100.'
  }
  if (roundLimit !== undefined && !inRange(roundLimit, settingsLimits.roundLimit)) {
    errors.roundLimit = 'A whole number of rounds between 1 and 10.'
  }
  if (
    questionsPerQuiz !== undefined &&
    questionsPerQuiz !== null &&
    !inRange(questionsPerQuiz, settingsLimits.questionsPerQuiz)
  ) {
    errors.questionsPerQuiz = 'Automatic, or a whole number between 4 and 20.'
  }
  if (claudeCliPath !== undefined && claudeCliPath !== null) {
    const absolute = /^(\/|[A-Za-z]:[\\/])/.test(claudeCliPath)
    if (typeof claudeCliPath !== 'string' || !claudeCliPath.trim() || !absolute) {
      errors.claudeCliPath = 'An absolute path, or empty for the automatic lookup.'
    }
  }
  return errors
}

/** Result of the "Test" button of the Claude CLI path setting. */
export type CliCheck =
  { ok: true; path: string; version: string } | { ok: false; error: GenerationErrorInfo }

export interface CliCheckRequest {
  /** The path to test; null tests the automatic lookup. */
  claudeCliPath: string | null
}
