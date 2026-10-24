// First launch: the Generation Language is asked once, before anything is generated.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  getGenerationLanguage,
  isGenerationLanguageChosen,
  updateSettings
} from '../db/repositories/settings'
import { createFirstRunIpc } from './firstRunIpc'
import { createSettingsIpc } from './settingsIpc'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

const firstRun = (systemLanguages: string[] = ['en-US'], onLanguageChosen?: () => void) =>
  createFirstRunIpc(db, { systemLanguages: () => systemLanguages, onLanguageChosen })

describe('first-run language choice', () => {
  it('shows the screen on a fresh folder: language not chosen, French by default', () => {
    expect(firstRun(['fr-FR']).get()).toEqual({ languageChosen: false, suggestedLanguage: 'fr' })
    expect(getGenerationLanguage(db)).toBe('fr')
  })

  it('preselects the system language when it is French or English, French otherwise', () => {
    expect(firstRun(['fr-CA']).get().suggestedLanguage).toBe('fr')
    expect(firstRun(['en-GB']).get().suggestedLanguage).toBe('en')
    expect(firstRun(['en_US']).get().suggestedLanguage).toBe('en')
    expect(firstRun(['de-DE', 'en-US']).get().suggestedLanguage).toBe('fr')
    expect(firstRun([]).get().suggestedLanguage).toBe('fr')
  })

  it('saves the language and the marker together', () => {
    const onChosen = vi.fn()
    const state = firstRun(['fr-FR'], onChosen).chooseLanguage({ language: 'en' })

    expect(state.languageChosen).toBe(true)
    expect(getGenerationLanguage(db)).toBe('en')
    expect(isGenerationLanguageChosen(db)).toBe(true)
    expect(onChosen).toHaveBeenCalledTimes(1)
  })

  it('records a choice of French, which is also the default value', () => {
    firstRun().chooseLanguage({ language: 'fr' })
    expect(isGenerationLanguageChosen(db)).toBe(true)
    expect(getGenerationLanguage(db)).toBe('fr')
  })

  it('makes the choice once: a second call changes nothing', () => {
    const onChosen = vi.fn()
    const ipc = firstRun(['fr-FR'], onChosen)
    ipc.chooseLanguage({ language: 'en' })
    const again = ipc.chooseLanguage({ language: 'fr' })

    expect(again.languageChosen).toBe(true)
    expect(getGenerationLanguage(db)).toBe('en')
    expect(onChosen).toHaveBeenCalledTimes(1)
  })

  it('refuses a language that is neither French nor English, and saves nothing', () => {
    expect(() => firstRun().chooseLanguage({ language: 'de' as 'fr' })).toThrow()
    expect(() => firstRun().chooseLanguage({ language: 'en', extra: 1 } as never)).toThrow()
    expect(isGenerationLanguageChosen(db)).toBe(false)
  })

  it('survives a restart: the marker is stored in the database', () => {
    firstRun().chooseLanguage({ language: 'en' })
    // A new IPC on the same database stands for the next launch.
    expect(firstRun().get().languageChosen).toBe(true)
  })

  it('does not show the screen again after Settings changes the language', () => {
    firstRun().chooseLanguage({ language: 'en' })
    createSettingsIpc(db).update({ generationLanguage: 'fr' })

    expect(getGenerationLanguage(db)).toBe('fr')
    expect(firstRun(['en-US']).get().languageChosen).toBe(true)
  })

  it('does not mark the language chosen when a setting is saved before the choice', () => {
    updateSettings(db, { generationLanguage: 'en' })
    expect(firstRun().get().languageChosen).toBe(false)
  })
})
