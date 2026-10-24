import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { themes } from '../../../shared/theme'
import {
  TOKEN_FALLBACKS,
  diagramFontFamily,
  mermaidThemeVariables,
  type ThemeToken
} from './mermaidTheme'

const tokensCss = readFileSync(new URL('../styles/design-tokens.css', import.meta.url), 'utf8')

/** The declaration block of each theme in design-tokens.css. */
const blocks = {
  dark: /\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? '',
  light: /\[data-theme='light'\]\s*\{([^}]*)\}/.exec(tokensCss)?.[1] ?? ''
}

/** Value of a custom property declared in the block of a theme. */
const declared = (theme: 'dark' | 'light', name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(blocks[theme])?.[1]?.trim()

const resolved = themes.filter((theme) => theme !== 'system')

describe('Mermaid theme', () => {
  it('finds both theme blocks in the tokens file', () => {
    expect(blocks.dark).toContain('--color-canvas')
    expect(blocks.light).toContain('--color-canvas')
  })

  for (const theme of resolved) {
    describe(`${theme} theme`, () => {
      it('keeps fallbacks identical to the design tokens', () => {
        for (const [name, value] of Object.entries(TOKEN_FALLBACKS[theme])) {
          expect(declared(theme, name), name).toBe(value)
        }
      })

      it('builds the theme from the token values', () => {
        const variables = mermaidThemeVariables(theme, () => '')
        const fallback = TOKEN_FALLBACKS[theme]
        expect(variables['darkMode']).toBe(theme === 'dark')
        expect(variables['background']).toBe(fallback['--color-surface-base'])
        expect(variables['primaryColor']).toBe(fallback['--color-surface-elevated'])
        expect(variables['primaryTextColor']).toBe(fallback['--color-text-primary'])
        expect(variables['lineColor']).toBe(fallback['--color-text-secondary'])
        expect(variables['noteBorderColor']).toBe(fallback['--color-progress-text'])
      })

      it('prefers the values read from the stylesheet', () => {
        const read = (name: ThemeToken) => (name === '--color-surface-elevated' ? '#123456' : '')
        const variables = mermaidThemeVariables(theme, read)
        expect(variables['primaryColor']).toBe('#123456')
        expect(variables['actorBkg']).toBe('#123456')
        expect(variables['primaryTextColor']).toBe(TOKEN_FALLBACKS[theme]['--color-text-primary'])
      })

      it('only uses solid colors, which mermaid derives its shades from', () => {
        const colors = Object.entries(mermaidThemeVariables(theme, () => '')).filter(
          ([key]) => !['fontFamily', 'fontSize', 'darkMode', 'dropShadow'].includes(key)
        )
        for (const [key, value] of colors) expect(value, key).toMatch(/^#[0-9a-f]{6}$/)
      })

      it('uses the UI font of the theme', () => {
        expect(diagramFontFamily(theme, () => '')).toBe(TOKEN_FALLBACKS[theme]['--font-sans'])
        expect(diagramFontFamily(theme, () => 'Custom')).toBe('Custom')
      })
    })
  }

  it('draws text and lines in a different color in each theme', () => {
    const dark = mermaidThemeVariables('dark', () => '')
    const light = mermaidThemeVariables('light', () => '')
    for (const key of ['primaryColor', 'primaryTextColor', 'lineColor', 'noteBkgColor']) {
      expect(light[key], key).not.toBe(dark[key])
    }
    expect(diagramFontFamily('dark', () => '')).toContain('Geist Variable')
    expect(diagramFontFamily('light', () => '')).toContain('Plus Jakarta Sans Variable')
  })
})
