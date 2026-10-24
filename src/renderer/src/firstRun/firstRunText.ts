import type { GenerationLanguage } from '../../../shared/generationLanguage'

/**
 * Text of the first-run screen. The Generation Language is not known yet, so everything is shown
 * in French and in English side by side; each choice is named in its own language.
 */
export const firstRunText = {
  title: { fr: 'Langue du cours', en: 'Course language' },
  intro: {
    fr: 'Dans quelle langue veux-tu lire le cours ?',
    en: 'Which language do you want the course written in?'
  },
  // The choice can be changed later, but nothing is translated: each language has its own content.
  note: {
    fr: 'Tu pourras la changer plus tard dans les Paramètres, mais chaque langue génère son propre contenu.',
    en: 'You can change it later in Settings, but each language generates its own content.'
  },
  confirm: { fr: 'Continuer', en: 'Continue' },
  saving: { fr: 'Enregistrement...', en: 'Saving...' },
  failed: {
    fr: 'Le choix n’a pas pu être enregistré. Réessaie.',
    en: 'The choice could not be saved. Try again.'
  }
} as const

/** The choices, in display order, each named in its own language. */
export const languageChoices: readonly {
  language: GenerationLanguage
  name: string
  detail: { fr: string; en: string }
}[] = [
  {
    language: 'fr',
    name: 'Français',
    detail: {
      fr: 'Le cours est écrit en français.',
      en: 'The course is written in French.'
    }
  },
  {
    language: 'en',
    name: 'English',
    detail: {
      fr: 'Le cours est écrit en anglais.',
      en: 'The course is written in English.'
    }
  }
]
