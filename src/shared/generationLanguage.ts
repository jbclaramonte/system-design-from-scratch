/**
 * The Generation Language: the language of the course content the learner reads (Lessons, quizzes,
 * feedback...). A setting, French by default. The app UI is English whatever it is.
 */
export const generationLanguages = ['fr', 'en'] as const
export type GenerationLanguage = (typeof generationLanguages)[number]

/** Language of every install before the setting existed: their content is French. */
export const DEFAULT_GENERATION_LANGUAGE: GenerationLanguage = 'fr'

/** Names for the Settings screen and the docs. */
export const generationLanguageLabels: Record<GenerationLanguage, string> = {
  fr: 'French',
  en: 'English'
}

export const isGenerationLanguage = (value: unknown): value is GenerationLanguage =>
  typeof value === 'string' && (generationLanguages as readonly string[]).includes(value)
