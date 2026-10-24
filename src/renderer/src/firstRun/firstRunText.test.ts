import { describe, expect, it } from 'vitest'
import { generationLanguages } from '../../../shared/generationLanguage'
import { firstRunText, languageChoices } from './firstRunText'

describe('first-run text', () => {
  it('offers every Generation Language once, French first', () => {
    expect(languageChoices.map((choice) => choice.language)).toEqual([...generationLanguages])
    expect(languageChoices.map((choice) => choice.name)).toEqual(['Français', 'English'])
  })

  it('is written in both languages for every line', () => {
    for (const line of Object.values(firstRunText)) {
      expect(line.fr.length).toBeGreaterThan(0)
      expect(line.en.length).toBeGreaterThan(0)
      expect(line.fr).not.toBe(line.en)
    }
  })
})
