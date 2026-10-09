import type { Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { componentShapeUtils } from './componentShapes'
import {
  COMPONENT_LOOKS,
  COMPONENT_TYPES,
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
})
