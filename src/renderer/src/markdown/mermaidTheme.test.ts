import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TOKEN_FALLBACKS,
  diagramFontFamily,
  mermaidThemeVariables,
  type ThemeToken
} from './mermaidTheme'

const tokensCss = readFileSync(new URL('../styles/design-tokens.css', import.meta.url), 'utf8')

/** Value of a custom property declared in design-tokens.css. */
const declared = (name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)?.[1]?.trim()

describe('Mermaid theme', () => {
  it('keeps fallbacks identical to the design tokens', () => {
    for (const [name, value] of Object.entries(TOKEN_FALLBACKS)) {
      expect(declared(name), name).toBe(value)
    }
  })

  it('builds a dark theme from the token values', () => {
    const variables = mermaidThemeVariables(() => '')
    expect(variables['darkMode']).toBe(true)
    expect(variables['background']).toBe(TOKEN_FALLBACKS['--color-surface-base'])
    expect(variables['primaryColor']).toBe(TOKEN_FALLBACKS['--color-surface-elevated'])
    expect(variables['primaryTextColor']).toBe(TOKEN_FALLBACKS['--color-text-primary'])
    expect(variables['lineColor']).toBe(TOKEN_FALLBACKS['--color-text-secondary'])
  })

  it('prefers the values read from the stylesheet', () => {
    const read = (name: ThemeToken) => (name === '--color-surface-elevated' ? '#123456' : '')
    const variables = mermaidThemeVariables(read)
    expect(variables['primaryColor']).toBe('#123456')
    expect(variables['actorBkg']).toBe('#123456')
    expect(variables['primaryTextColor']).toBe(TOKEN_FALLBACKS['--color-text-primary'])
  })

  it('only uses solid colors, which mermaid derives its shades from', () => {
    const colors = Object.entries(mermaidThemeVariables(() => '')).filter(
      ([key]) => !['fontFamily', 'fontSize', 'darkMode', 'dropShadow'].includes(key)
    )
    for (const [key, value] of colors) expect(value, key).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('uses the UI font of the app', () => {
    expect(diagramFontFamily(() => '')).toContain('Geist Variable')
    expect(diagramFontFamily(() => 'Custom')).toBe('Custom')
  })
})
