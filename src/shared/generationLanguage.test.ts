import { describe, expect, it } from 'vitest'
import { suggestedGenerationLanguage } from './generationLanguage'

describe('suggestedGenerationLanguage', () => {
  it('follows the first system language when it is French or English', () => {
    expect(suggestedGenerationLanguage(['fr'])).toBe('fr')
    expect(suggestedGenerationLanguage(['fr-FR', 'en-US'])).toBe('fr')
    expect(suggestedGenerationLanguage(['en-US', 'fr-FR'])).toBe('en')
    expect(suggestedGenerationLanguage(['EN_gb'])).toBe('en')
  })

  it('falls back to French for any other language, or none', () => {
    expect(suggestedGenerationLanguage(['de-DE'])).toBe('fr')
    expect(suggestedGenerationLanguage(['zh-Hans-CN', 'en-US'])).toBe('fr')
    expect(suggestedGenerationLanguage([])).toBe('fr')
    expect(suggestedGenerationLanguage([''])).toBe('fr')
  })
})
