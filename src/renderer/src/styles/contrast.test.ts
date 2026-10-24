import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * WCAG contrast of the documented text and surface pairs of both themes (docs/Design System.md,
 * "Contrast"). Reads design-tokens.css, so a token change that breaks a pair fails here: fix the
 * token, not the test. Text must reach 4.5:1 (AA); large text, focus rings and control borders
 * 3:1.
 */

const css = readFileSync(new URL('./design-tokens.css', import.meta.url), 'utf8')

type Rgb = [number, number, number]
type Rgba = [number, number, number, number]

/** The declarations of the block whose selector starts with `selector`. */
function themeBlock(selector: string): Map<string, string> {
  const start = css.indexOf(selector)
  expect(start, `block ${selector}`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
  const tokens = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(name as string, (value as string).trim())
  }
  return tokens
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1] as string, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgba) {
    const [r, g, b, a = '1'] = (rgba[1] as string).split(',').map((part) => part.trim())
    return [Number(r), Number(g), Number(b), Number(a)]
  }
  throw new Error(`Not a plain color: ${value}`)
}

/** `top` drawn over the opaque `below`. */
function over(top: Rgba, below: Rgb): Rgb {
  const [r, g, b, a] = top
  return [r * a + below[0] * (1 - a), g * a + below[1] * (1 - a), b * a + below[2] * (1 - a)]
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

const themes = {
  dark: themeBlock(":root,\n[data-theme='dark']"),
  light: themeBlock(":root[data-theme='light']")
}
type ThemeName = keyof typeof themes

const SURFACES = [
  '--color-canvas',
  '--color-surface-base',
  '--color-surface-elevated',
  '--color-surface-raised',
  '--color-surface-subtle'
]

/** An opaque color of a theme, or a translucent one drawn over `surface`. */
function resolve(theme: ThemeName, token: string, surface: string): Rgb {
  const value = themes[theme].get(token)
  if (!value) throw new Error(`${theme} has no ${token}`)
  return over(parseColor(value), over(parseColor(themes[theme].get(surface) as string), [0, 0, 0]))
}

interface Pair {
  name: string
  fg: string
  /** A token drawn over `surface`, or the surface itself. */
  bg: string
  /** Surface under a translucent `bg` (and the one `fg` sits on when `bg` is a surface). */
  surfaces: string[]
  min: number
}

const accents = ['mastered', 'progress', 'attention', 'error'] as const

function pairsOf(theme: ThemeName): Pair[] {
  const pairs: Pair[] = []
  // Dark is the frozen "Terminal Architect": its documented exception is text-muted (about 4.1:1
  // on the canvas, footnotes and structural glyphs only), which locked chips also use.
  const texts =
    theme === 'light'
      ? ['--color-text-primary', '--color-text-secondary', '--color-text-muted']
      : ['--color-text-primary', '--color-text-secondary']
  for (const fg of texts) {
    for (const bg of SURFACES)
      pairs.push({ name: `${fg} on ${bg}`, fg, bg, surfaces: [bg], min: 4.5 })
  }
  const textSurfaces = ['--color-canvas', '--color-surface-base', '--color-surface-elevated']
  for (const accent of accents) {
    for (const surface of textSurfaces) {
      pairs.push({
        name: `${accent}-text on its fill over ${surface}`,
        fg: `--color-${accent}-text`,
        bg: `--color-${accent}-fill`,
        surfaces: [surface],
        min: 4.5
      })
    }
  }
  if (theme === 'light') {
    for (const surface of textSurfaces) {
      pairs.push({
        name: `locked-text on its fill over ${surface}`,
        fg: '--color-locked-text',
        bg: '--color-locked-fill',
        surfaces: [surface],
        min: 4.5
      })
    }
  }
  for (const surface of textSurfaces) {
    pairs.push({
      name: `link on ${surface}`,
      fg: '--color-link',
      bg: surface,
      surfaces: [surface],
      min: 4.5
    })
  }
  for (const action of ['--color-action', '--color-action-hover', '--color-action-active']) {
    pairs.push({
      name: `on-primary on ${action}`,
      fg: '--color-on-primary',
      bg: action,
      surfaces: ['--color-canvas'],
      min: 4.5
    })
  }
  for (const cell of ['mastered', 'partial', 'low'] as const) {
    pairs.push({
      name: `heat ${cell} text`,
      fg: `--color-heat-${cell}-text`,
      bg: `--color-heat-${cell}`,
      surfaces: ['--color-canvas'],
      min: 4.5
    })
  }
  for (const cell of ['a', 'b']) {
    pairs.push({
      name: `heat untested ${cell} text`,
      fg: '--color-heat-untested-text',
      bg: `--color-heat-untested-${cell}`,
      surfaces: ['--color-canvas'],
      min: 4.5
    })
  }
  // The active navigation item sits on the header (surface-base).
  pairs.push({
    name: 'active navigation item text',
    fg: '--color-nav-active-text',
    bg: '--color-nav-active-fill',
    surfaces: ['--color-surface-base'],
    min: 4.5
  })
  // Icon tiles: the glyph is a graphic (3:1) on the tinted square, which sits on cards or the canvas.
  for (const role of ['mastered', 'progress', 'attention', 'neutral']) {
    pairs.push({
      name: `${role} icon tile glyph`,
      fg: `--color-tile-${role}-glyph`,
      bg: `--color-tile-${role}-fill`,
      surfaces: ['--color-surface-base', '--color-canvas'],
      min: 3
    })
  }
  // UI components: the focus ring and the selected-tab underline against the page and cards.
  for (const fg of ['--color-border-focus', '--color-progress']) {
    for (const bg of ['--color-canvas', '--color-surface-base']) {
      pairs.push({ name: `${fg} on ${bg}`, fg, bg, surfaces: [bg], min: 3 })
    }
  }
  // A form field has no label inside its boundary: its border reaches 3:1 (light theme; the dark
  // theme keeps its hairline inputs).
  if (theme === 'light') {
    for (const bg of SURFACES) {
      pairs.push({
        name: `input border on ${bg}`,
        fg: '--color-border-input',
        bg,
        surfaces: [bg],
        min: 3
      })
    }
  }
  return pairs
}

describe.each(['light', 'dark'] as const)('contrast of the %s theme', (theme) => {
  for (const pair of pairsOf(theme)) {
    for (const surface of pair.surfaces) {
      it(`${pair.name} reaches ${pair.min}:1`, () => {
        // A translucent fg (borders) is drawn over the surface; a translucent bg too.
        const bg = resolve(theme, pair.bg, surface)
        const fgValue = parseColor(themes[theme].get(pair.fg) as string)
        const fg = over(fgValue, bg)
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(pair.min)
      })
    }
  }
})

describe('the contrast test itself', () => {
  it('computes the known ratios', () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    // White on #F97316 is only about 2.8:1, which is why button fills use a darker orange.
    expect(ratio([255, 255, 255], parseColor('#f97316').slice(0, 3) as Rgb)).toBeCloseTo(2.8, 1)
    expect(ratio([255, 255, 255], parseColor('#c2410c').slice(0, 3) as Rgb)).toBeGreaterThan(5)
  })

  it('reads both theme blocks', () => {
    expect(themes.light.get('--color-canvas')).toBe('#fff8f5')
    expect(themes.dark.get('--color-canvas')).toBe('#06080d')
    expect(themes.light.get('--font-sans')).toMatch(/^'Plus Jakarta Sans Variable'/)
    expect(themes.dark.get('--font-sans')).toMatch(/^'Geist Variable'/)
  })

  it('gives both themes the same tokens', () => {
    const names = (theme: ThemeName) => [...themes[theme].keys()].sort()
    expect(names('light')).toEqual(names('dark'))
  })
})
