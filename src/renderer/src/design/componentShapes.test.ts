import { renderToStaticMarkup } from 'react-dom/server'
import type { Editor, TLShape, SvgExportContext } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { componentShapeUtils } from './componentShapes'
import {
  COMPONENT_LOOKS,
  COMPONENT_TYPES,
  componentColors,
  isComponentType,
  loadBalancerPoints
} from './componentTypes'

const editor = {} as Editor

describe('component shapes', () => {
  it('has exactly one shape util per component type', () => {
    expect(componentShapeUtils.map((util) => util.type)).toEqual([...COMPONENT_TYPES])
  })

  it('gives each type a distinct look', () => {
    const strokes = COMPONENT_TYPES.map((type) => COMPONENT_LOOKS[type].stroke)
    const labels = COMPONENT_TYPES.map((type) => COMPONENT_LOOKS[type].label)

    expect(new Set(strokes).size).toBe(COMPONENT_TYPES.length)
    expect(new Set(labels).size).toBe(COMPONENT_TYPES.length)
  })

  it('defaults to the size and label of the type', () => {
    for (const Util of componentShapeUtils) {
      const { defaultW, defaultH, label } = COMPONENT_LOOKS[Util.type]

      expect(new Util(editor).getDefaultProps()).toEqual({ w: defaultW, h: defaultH, text: label })
    }
  })

  it('validates props and accepts arrow bindings', () => {
    for (const Util of componentShapeUtils) {
      expect(Object.keys(Util.props).sort()).toEqual(['h', 'text', 'w'])
      expect(new Util(editor).canBind()).toBe(true)
    }
  })

  it('gives the load balancer a hexagon outline for arrow anchoring', () => {
    expect(loadBalancerPoints(160, 90)).toEqual([
      { x: 24, y: 0 },
      { x: 136, y: 0 },
      { x: 160, y: 45 },
      { x: 136, y: 90 },
      { x: 24, y: 90 },
      { x: 0, y: 45 }
    ])
  })

  it('recognises component types', () => {
    expect(isComponentType('database')).toBe(true)
    expect(isComponentType('geo')).toBe(false)
  })

  it('colors the live canvas for dark mode and keeps the light palette for exports', () => {
    for (const type of COMPONENT_TYPES) {
      const { fill, stroke } = COMPONENT_LOOKS[type]
      const light = componentColors(type, 'light')
      const dark = componentColors(type, 'dark')

      expect(light).toEqual({ fill, stroke, text: '#1d1d1d' })
      expect(dark.fill).not.toBe(light.fill)
      expect(dark.stroke).not.toBe(light.stroke)
      expect(dark.text).toBe('var(--color-text-primary)')
    }
    const strokes = COMPONENT_TYPES.map((type) => componentColors(type, 'dark').stroke)
    expect(new Set(strokes).size).toBe(COMPONENT_TYPES.length)
  })

  it('draws the image export (PNG/SVG) in the light palette, whatever the editor theme', () => {
    for (const Util of componentShapeUtils) {
      const shape = {
        id: 'shape:x',
        type: Util.type,
        props: { w: 160, h: 90, text: 'Label' }
      } as unknown as TLShape
      const svg = renderToStaticMarkup(
        new Util(editor).toSvg(shape as never, { isDarkMode: true } as SvgExportContext) as never
      )
      const light = componentColors(Util.type, 'light')
      const dark = componentColors(Util.type, 'dark')

      expect(svg).toContain(`stroke="${light.stroke}"`)
      expect(svg).toContain(`fill="${light.text}"`)
      expect(svg).not.toContain(dark.stroke)
      expect(svg).not.toContain('var(--')
    }
  })
})
