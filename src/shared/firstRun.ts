/**
 * First launch: the learner chooses the Generation Language before anything is generated. The
 * state lives in the main process (a "language chosen" marker next to the `generationLanguage`
 * setting); the renderer shows the first-run screen while the language is not chosen.
 */
import { z } from 'zod'
import { generationLanguages, type GenerationLanguage } from './generationLanguage'

export interface FirstRunState {
  /** Whether the learner chose the language (also true for an install that predates the choice). */
  languageChosen: boolean
  /** The language to preselect: the system language when French or English, French otherwise. */
  suggestedLanguage: GenerationLanguage
}

export interface ChooseLanguageRequest {
  language: GenerationLanguage
}

export const chooseLanguageRequest = z.object({ language: z.enum(generationLanguages) }).strict()
