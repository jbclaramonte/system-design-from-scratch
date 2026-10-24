// First launch over IPC: whether the Generation Language was chosen, and the choice itself. The
// choice writes the `generationLanguage` setting and the "language chosen" marker together, once.
import type { Database } from '../db'
import {
  chooseLanguageRequest,
  type ChooseLanguageRequest,
  type FirstRunState
} from '../../shared/firstRun'
import { suggestedGenerationLanguage } from '../../shared/generationLanguage'
import { chooseGenerationLanguage, isGenerationLanguageChosen } from '../db/repositories/settings'

export interface FirstRunIpc {
  get(): FirstRunState
  chooseLanguage(request: ChooseLanguageRequest): FirstRunState
}

export interface FirstRunIpcOptions {
  /** The system's preferred languages, most preferred first (`app.getPreferredSystemLanguages`). */
  systemLanguages: () => readonly string[]
  /** Called after the choice is saved (the launch update check waits for it). */
  onLanguageChosen?: () => void
}

export function createFirstRunIpc(db: Database, options: FirstRunIpcOptions): FirstRunIpc {
  const state = (): FirstRunState => ({
    languageChosen: isGenerationLanguageChosen(db),
    suggestedLanguage: suggestedGenerationLanguage(options.systemLanguages())
  })

  return {
    get: state,

    chooseLanguage(request) {
      const { language } = chooseLanguageRequest.parse(request)
      if (chooseGenerationLanguage(db, language)) options.onLanguageChosen?.()
      return state()
    }
  }
}
