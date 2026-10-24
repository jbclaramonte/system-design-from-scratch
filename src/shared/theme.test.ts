import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, isTheme, resolveTheme, themeWindowBackground, themes } from './theme'

describe('Theme', () => {
  it('defaults to System', () => {
    expect(DEFAULT_THEME).toBe('system')
  })

  it('accepts System, Light and Dark, nothing else', () => {
    for (const theme of themes) expect(isTheme(theme)).toBe(true)
    for (const value of ['', 'auto', 'Light', 'warm', null, undefined, 1]) {
      expect(isTheme(value)).toBe(false)
    }
  })

  it('makes System follow the media query and keeps an explicit choice', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('starts the native window on the canvas color of each theme', () => {
    const css = readFileSync(
      new URL('../renderer/src/styles/design-tokens.css', import.meta.url),
      'utf8'
    )
    const canvases = [...css.matchAll(/--color-canvas:\s*(#[0-9a-f]{6});/g)].map((m) => m[1])
    // The dark block comes first in the file, the light block second.
    expect(canvases).toEqual([themeWindowBackground.dark, themeWindowBackground.light])
  })
})
