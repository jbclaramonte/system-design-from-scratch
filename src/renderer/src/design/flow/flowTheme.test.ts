import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { COMPONENT_TYPES, componentColors, type ComponentType } from '../componentTypes'
import { ComponentBody } from './ComponentBody'
import { createEdge, edgeMarkers, toFlow } from './flowModel'
import { architectureScene } from './sceneFixtures'
import { EXPORT_TOKENS_THEME, FLOW_PALETTES, flowModeOfTheme, type FlowMode } from './flowTheme'

/**
 * The Design Canvas takes its colors from JavaScript (nodes, edges, markers), so the theme has to
 * reach it by hand: these tests pin what each mode draws, against the tokens of design-tokens.css.
 */

const css = readFileSync(new URL('../../styles/design-tokens.css', import.meta.url), 'utf8')
const canvasCss = readFileSync(new URL('./flowCanvas.css', import.meta.url), 'utf8')

type Rgb = [number, number, number]

function themeTokens(selector: string): Map<string, string> {
  const start = css.indexOf(selector)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name as string,
      (value as string).trim()
    ])
  )
}

const tokens = {
  dark: themeTokens(":root,\n[data-theme='dark']"),
  light: themeTokens(":root[data-theme='light']")
}

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A palette color as an opaque RGB value of a theme (a `var()` is looked up, a hex is itself). */
function solid(theme: 'dark' | 'light', value: string): Rgb {
  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(value)
  const resolved = variable ? tokens[theme].get(variable[1] as string) : value
  if (!resolved || !/^#[0-9a-f]{6}$/i.test(resolved)) throw new Error(`Not a solid color: ${value}`)
  return hexToRgb(resolved)
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const LIVE = ['dark', 'light'] as const

describe('flow mode of a theme', () => {
  it('is the theme itself for the live canvas', () => {
    expect(flowModeOfTheme('dark')).toBe('dark')
    expect(flowModeOfTheme('light')).toBe('light')
  })
})

describe('live palettes follow the tokens', () => {
  const tokenNames = (palette: (typeof FLOW_PALETTES)['dark']) =>
    JSON.stringify(palette).match(/--[a-z0-9-]+/g) ?? []

  for (const mode of LIVE) {
    it(`${mode}: only names tokens, and both themes define them`, () => {
      const json = JSON.stringify(FLOW_PALETTES[mode])
      expect(json).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
      const names = tokenNames(FLOW_PALETTES[mode])
      expect(names.length).toBeGreaterThan(0)
      for (const name of names) {
        expect(tokens.dark.has(name), `dark ${name}`).toBe(true)
        expect(tokens.light.has(name), `light ${name}`).toBe(true)
      }
    })
  }

  it('keeps the arrowheads valid across a theme switch (same marker color in both)', () => {
    expect(edgeMarkers('both', 'dark')).toEqual(edgeMarkers('both', 'light'))
    expect(FLOW_PALETTES.dark.edge).toBe(FLOW_PALETTES.light.edge)
    const dark = toFlow(architectureScene(), 'dark')
    const light = toFlow(architectureScene(), 'light')
    expect(light.edges).toEqual(dark.edges)
    const created = createEdge('e', { source: 'a', target: 'b' }, 'light')
    expect(created.markerEnd).toEqual(edgeMarkers('forward', 'dark').markerEnd)
  })

  for (const theme of LIVE) {
    const canvas = solid(theme, 'var(--color-canvas)')

    it(`${theme}: edges, selected edges and labels are readable on the canvas`, () => {
      const palette = FLOW_PALETTES[theme]
      expect(contrast(solid(theme, palette.edge), canvas)).toBeGreaterThanOrEqual(3)
      expect(contrast(solid(theme, palette.edgeSelected), canvas)).toBeGreaterThanOrEqual(3)
      expect(palette.edgeSelected).not.toBe(palette.edge)
      expect(
        contrast(solid(theme, palette.label.text), solid(theme, palette.label.fill))
      ).toBeGreaterThanOrEqual(4.5)
    })

    it(`${theme}: handles and the dotted grid show on the canvas`, () => {
      // flowCanvas.css maps React Flow's variables to tokens: the handle is the in-progress
      // color with a canvas-colored ring.
      expect(canvasCss).toContain('--xy-handle-background-color: var(--color-progress)')
      expect(canvasCss).toContain('--xy-handle-border-color: var(--color-canvas)')
      expect(contrast(solid(theme, 'var(--color-progress)'), canvas)).toBeGreaterThanOrEqual(3)
    })

    it(`${theme}: typed components keep their hue, their label is readable on their fill and their stroke shows on the canvas`, () => {
      for (const type of COMPONENT_TYPES) {
        const { fill, stroke, text } = componentColors(type, theme)
        expect(contrast(hexToRgb(stroke), canvas), `${type} stroke`).toBeGreaterThanOrEqual(3)
        expect(
          contrast(solid(theme, text), hexToRgb(fill)),
          `${type} label`
        ).toBeGreaterThanOrEqual(4.5)
      }
    })

    // Color is not the only cue (each type has its own shape and label); the strokes are also
    // pairwise apart. The closest pair is the teal and the emerald of the Dark theme.
    it(`${theme}: the seven types stay distinguishable from each other`, () => {
      const strokes = COMPONENT_TYPES.map((type) => hexToRgb(componentColors(type, theme).stroke))
      for (let i = 0; i < strokes.length; i += 1) {
        for (let j = i + 1; j < strokes.length; j += 1) {
          expect(
            distance(strokes[i] as Rgb, strokes[j] as Rgb),
            `${COMPONENT_TYPES[i]} / ${COMPONENT_TYPES[j]}`
          ).toBeGreaterThan(35)
        }
      }
    })

    it(`${theme}: notes and groups are readable`, () => {
      const { note, group } = FLOW_PALETTES[theme]
      // The note fill may be a color-mix of tokens: read the text on the base it mixes into.
      const noteFill = note.fill.startsWith('color-mix')
        ? solid(theme, 'var(--color-surface-base)')
        : solid(theme, note.fill)
      expect(contrast(solid(theme, note.text), noteFill)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(solid(theme, note.stroke), canvas)).toBeGreaterThanOrEqual(1.5)
      expect(contrast(solid(theme, group.text), canvas)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('keeps each type on one hue across the modes', () => {
    const hue = ([r, g, b]: Rgb) => {
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      if (max === min) return 0
      const d = max - min
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    for (const type of COMPONENT_TYPES.filter((t) => t !== 'client')) {
      const dark = hue(hexToRgb(componentColors(type, 'dark').stroke))
      const light = hue(hexToRgb(componentColors(type, 'light').stroke))
      expect(apart(dark, light), type).toBeLessThan(25)
    }
  })
})

describe('Design Export', () => {
  const NODE_COLORS = (mode: FlowMode, type: ComponentType) => componentColors(type, mode)

  it('draws in literal colors: no token, so no theme can change it', () => {
    expect(JSON.stringify(FLOW_PALETTES.export)).not.toContain('var(')
    for (const type of COMPONENT_TYPES) {
      expect(JSON.stringify(NODE_COLORS('export', type)), type).not.toContain('var(')
    }
    const flow = toFlow(architectureScene(), 'export')
    expect(JSON.stringify(flow)).not.toContain('var(')
  })

  it('is the same markup whatever the theme of the app: nothing it draws reads a token', () => {
    // The export host is pinned to one theme for the tokens its stylesheet reads, and its nodes
    // take every color from the `export` mode: the drawing does not depend on `data-theme`.
    const draw = () =>
      COMPONENT_TYPES.map((type) =>
        renderToStaticMarkup(
          createElement(
            'svg',
            null,
            createElement(ComponentBody, { type, w: 160, h: 90, mode: 'export' })
          )
        )
      ).join('\n')
    const inLight = draw()
    const inDark = draw()
    expect(inLight).toBe(inDark)
    expect(inLight).not.toContain('var(')
    expect(EXPORT_TOKENS_THEME).toBe('dark')
  })

  it('keeps the export palette as it was (the PNG the LLM reads did not change)', () => {
    expect(FLOW_PALETTES.export).toEqual({
      edge: '#334155',
      edgeSelected: '#334155',
      label: { fill: '#ffffff', text: '#1d1d1d' },
      note: { fill: '#fef9c3', stroke: '#ca8a04', text: '#1d1d1d' },
      group: { fill: 'rgba(100, 116, 139, 0.06)', stroke: '#64748b', text: '#475569' }
    })
    expect(componentColors('service', 'export')).toEqual({
      fill: '#e0e7ff',
      stroke: '#4f46e5',
      text: '#1d1d1d'
    })
    expect(edgeMarkers('forward', 'export').markerEnd).toMatchObject({ color: '#334155' })
  })
})
