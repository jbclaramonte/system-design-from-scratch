import { describe, expect, it } from 'vitest'
import { toScene } from './flowModel'
import {
  deserializeScene,
  EMPTY_SCENE,
  InvalidSceneError,
  parseSceneText,
  serializeScene,
  type Scene
} from './scene'
import { architectureScene, component, edge, group, note, scene } from './sceneFixtures'

describe('scene format', () => {
  it('round-trips through JSON text unchanged', () => {
    const original = architectureScene()
    const stored = serializeScene(original)
    expect(deserializeScene(JSON.parse(JSON.stringify(stored)))).toEqual(original)
    expect(parseSceneText(JSON.stringify(stored))).toEqual(original)
  })

  it('serializes deterministically', () => {
    expect(JSON.stringify(serializeScene(architectureScene()))).toBe(
      JSON.stringify(serializeScene(architectureScene()))
    )
  })

  it('treats a missing stored value as "no scene yet", not as an error', () => {
    expect(deserializeScene(null)).toBeUndefined()
    expect(deserializeScene(JSON.parse(JSON.stringify(EMPTY_SCENE)))).toEqual(EMPTY_SCENE)
  })

  it('drops unknown fields (editor state never reaches the storage)', () => {
    const dirty = JSON.parse(JSON.stringify(architectureScene())) as Record<string, unknown>
    ;(dirty['nodes'] as Record<string, unknown>[])[1]!['selected'] = true
    ;(dirty['nodes'] as Record<string, unknown>[])[1]!['measured'] = { width: 1, height: 2 }
    const clean = deserializeScene(dirty as never)!
    expect(clean.nodes[1]).not.toHaveProperty('selected')
    expect(clean.nodes[1]).not.toHaveProperty('measured')
  })

  const invalid: Array<[string, unknown]> = [
    ['an array', []],
    ['a string', 'scene'],
    ['a tldraw snapshot', { document: { store: {}, schema: {} }, session: {} }],
    ['an unknown version', { ...EMPTY_SCENE, version: 2 }],
    ['a missing viewport', { version: 1, nodes: [], edges: [] }],
    ['a zero zoom', { ...EMPTY_SCENE, viewport: { x: 0, y: 0, zoom: 0 } }],
    [
      'an unknown component type',
      {
        ...EMPTY_SCENE,
        nodes: [
          { ...component('a', 'service', 0, 0), data: { componentType: 'mainframe', label: '' } }
        ]
      }
    ],
    [
      'a negative size',
      { ...EMPTY_SCENE, nodes: [{ ...component('a', 'service', 0, 0), width: -1 }] }
    ],
    [
      'a non-finite position',
      {
        ...EMPTY_SCENE,
        nodes: [{ ...component('a', 'service', 0, 0), position: { x: null, y: 0 } }]
      }
    ],
    [
      'an unknown node type',
      { ...EMPTY_SCENE, nodes: [{ ...component('a', 'service', 0, 0), type: 'diamond' }] }
    ],
    [
      'an unknown direction',
      {
        ...EMPTY_SCENE,
        nodes: [component('a', 'service', 0, 0)],
        edges: [{ ...edge('e', 'a', 'a'), data: { label: '', direction: 'up' } }]
      }
    ]
  ]
  it.each(invalid)('rejects %s with an explicit error', (_name, value) => {
    expect(() => deserializeScene(value as never)).toThrow(InvalidSceneError)
    expect(() => deserializeScene(value as never)).toThrow(/Stored Design Scene is not valid/)
  })

  it('names the path of the first problems', () => {
    const broken = scene([component('a', 'service', 0, 0)], [edge('e', 'a', 'ghost')])
    expect(() => deserializeScene(broken as never)).toThrow(/edges\.0\.target.*ghost/)
  })

  it('rejects broken structure: duplicate ids, parents, group edges, cycles', () => {
    const cases: Scene[] = [
      scene([component('a', 'service', 0, 0), component('a', 'cache', 0, 0)]),
      scene([component('a', 'service', 0, 0), edge('a', 'a', 'a') as never]),
      scene([component('a', 'service', 0, 0, 'A', 'ghost')]),
      scene([component('a', 'service', 0, 0), component('b', 'cache', 0, 0, 'B', 'a')]),
      scene([group('g1', 0, 0, 'one', 'g2'), group('g2', 0, 0, 'two', 'g1')]),
      scene([group('g1', 0, 0, 'one', 'g1')]),
      scene([group('g', 0, 0, 'g'), component('a', 'service', 0, 0)], [edge('e', 'g', 'a')]),
      scene([note('n', 0, 0, 'x')], [edge('e', 'n', 'missing')])
    ]
    for (const broken of cases) {
      expect(() => deserializeScene(broken as never), JSON.stringify(broken)).toThrow(
        InvalidSceneError
      )
    }
  })

  it('refuses to serialize an invalid scene', () => {
    expect(() => serializeScene(scene([component('a', 'service', 0, 0, 'A', 'ghost')]))).toThrow(
      /Refusing to store/
    )
  })

  it('reports invalid JSON text and an empty value', () => {
    expect(() => parseSceneText('{nope')).toThrow(/not valid JSON/)
    expect(() => parseSceneText('null')).toThrow(/empty/)
    expect(() => parseSceneText('{}')).toThrow(InvalidSceneError)
  })

  it('stores the editor state without selection, measures or arrowheads', () => {
    const original = architectureScene()
    const nodes = original.nodes.map((node) => ({
      ...node,
      selected: true,
      dragging: false,
      measured: { width: 999, height: 999 },
      width: undefined,
      height: undefined
    }))
    const stored = toScene(
      nodes as never,
      original.edges.map((e) => ({
        ...e,
        selected: true,
        markerEnd: { type: 'arrowclosed' }
      })) as never,
      original.viewport
    )
    // Without explicit sizes the measured size is used, then the default of the type.
    expect(stored.nodes[1]).toMatchObject({ width: 999, height: 999 })
    expect(JSON.stringify(stored)).not.toMatch(/selected|marker|dragging|measured/)
    expect(() => serializeScene(stored)).not.toThrow()
  })
})
