import { describe, expect, it } from 'vitest'
import { designGraphSchema } from '../../../../shared/designGraph'
import { describeDesignGraph } from '../export/describeDesignGraph'
import { buildDesignGraphFromScene } from './exportGraph'
import { toScene } from './flowModel'
import { architectureScene, component, edge, group, note, scene } from './sceneFixtures'

describe('buildDesignGraphFromScene', () => {
  it('maps a scene to a valid Design Graph', () => {
    const graph = buildDesignGraphFromScene(architectureScene())
    expect(designGraphSchema.safeParse(graph).success).toBe(true)
    expect(graph.nodes.map((n) => [n.id, n.componentType, n.label])).toEqual([
      ['svc-a', 'service', 'Service A'],
      ['client', 'client', 'Client'],
      ['lb', 'load-balancer', 'Load balancer'],
      ['db', 'database', 'Users'],
      ['svc-b', 'service', 'Service B'],
      ['cache', 'cache', 'Cache']
    ])
    expect(graph.edges.map((e) => [e.id, e.from, e.to, e.direction, e.label])).toEqual([
      ['e4', 'svc-a', 'db', 'both', 'SQL'],
      ['e1', 'client', 'lb', 'forward', 'HTTPS'],
      ['e2', 'lb', 'svc-a', 'forward', ''],
      ['e3', 'lb', 'svc-b', 'forward', ''],
      ['e5', 'svc-b', 'db', 'none', ''],
      ['e6', 'cache', 'svc-a', 'backward', '']
    ])
    expect(graph.danglingArrows).toEqual([])
  })

  it('sums the group offsets into page positions and sizes', () => {
    const graph = buildDesignGraphFromScene(architectureScene())
    expect(graph.nodes.find((n) => n.id === 'svc-a')).toMatchObject({
      position: { x: 440, y: 40 },
      size: { w: 160, h: 90 }
    })
    expect(graph.nodes.find((n) => n.id === 'svc-b')?.position).toEqual({ x: 440, y: 180 })
  })

  it('lists groups with every member at any depth, notes included', () => {
    const graph = buildDesignGraphFromScene(
      scene([
        group('outer', 0, 0, ' Region '),
        group('inner', 20, 20, 'Zone', 'outer'),
        component('a', 'service', 10, 10, 'A', 'inner'),
        note('n', 10, 150, 'sticky', 'outer'),
        component('free', 'cache', 900, 900)
      ])
    )
    expect(graph.groups).toEqual([
      { id: 'outer', kind: 'frame', label: 'Region', memberIds: ['a', 'n'] },
      { id: 'inner', kind: 'frame', label: 'Zone', memberIds: ['a'] }
    ])
  })

  it('reports the nearest component of a note, within reach only', () => {
    const near = buildDesignGraphFromScene(
      scene([component('a', 'cache', 0, 0), note('n', 200, 0, 'Hot keys')])
    )
    expect(near.annotations).toEqual([
      { id: 'n', kind: 'note', text: 'Hot keys', position: { x: 200, y: 0 }, nearestNodeId: 'a' }
    ])
    const far = buildDesignGraphFromScene(
      scene([component('a', 'cache', 0, 0), note('n', 2000, 2000, 'Elsewhere')])
    )
    expect(far.annotations[0]?.nearestNodeId).toBeNull()
  })

  it('leaves out notes without text', () => {
    const graph = buildDesignGraphFromScene(scene([note('n', 0, 0, '   ')]))
    expect(graph.annotations).toEqual([])
  })

  it('turns an edge without a component at one end into a dangling arrow', () => {
    const graph = buildDesignGraphFromScene(
      scene(
        [component('a', 'service', 0, 0), note('n', 300, 0, 'queue it')],
        [edge('to-note', 'a', 'n', 'forward', 'async'), edge('from-note', 'n', 'a')]
      )
    )
    expect(graph.edges).toEqual([])
    expect(graph.danglingArrows).toEqual([
      { id: 'to-note', from: 'a', to: null, label: 'async' },
      { id: 'from-note', from: null, to: 'a', label: '' }
    ])
    expect(designGraphSchema.safeParse(graph).success).toBe(true)
  })

  it('does not break on an edge to a node that is not in the scene (live state in transition)', () => {
    const graph = buildDesignGraphFromScene({
      nodes: [component('a', 'service', 0, 0)],
      edges: [edge('ghost', 'a', 'gone'), edge('both-gone', 'x', 'y')]
    })
    expect(graph.danglingArrows).toEqual([
      { id: 'ghost', from: 'a', to: null, label: '' },
      { id: 'both-gone', from: null, to: null, label: '' }
    ])
  })

  it('keeps a self loop and parallel edges', () => {
    const graph = buildDesignGraphFromScene(
      scene(
        [component('a', 'service', 0, 0), component('b', 'queue', 300, 0)],
        [
          edge('loop', 'a', 'a'),
          edge('x', 'a', 'b', 'forward', 'publish'),
          edge('y', 'a', 'b', 'forward', 'retry')
        ]
      )
    )
    expect(graph.edges.map((e) => e.id)).toEqual(['loop', 'x', 'y'])
  })

  it('is deterministic: array order, rounding and -0 do not change the graph', () => {
    const base = architectureScene()
    const shuffled = {
      nodes: [...base.nodes].reverse(),
      edges: [...base.edges].reverse()
    }
    const expected = buildDesignGraphFromScene(base)
    expect(buildDesignGraphFromScene(shuffled)).toEqual(expected)
    expect(JSON.stringify(buildDesignGraphFromScene(shuffled))).toBe(JSON.stringify(expected))

    const jittered = scene([component('a', 'cache', -0.4, 0.4)])
    expect(buildDesignGraphFromScene(jittered).nodes[0]?.position).toEqual({ x: 0, y: 0 })
    expect(Object.is(buildDesignGraphFromScene(jittered).nodes[0]?.position?.x, -0)).toBe(false)
  })

  it('exports the same graph from the editor state and from the stored scene', () => {
    const stored = architectureScene()
    const state = toScene(
      stored.nodes.map((n) => ({ ...n, selected: true })) as never,
      stored.edges.map((e) => ({ ...e, type: 'link' })) as never,
      stored.viewport
    )
    expect(buildDesignGraphFromScene(state)).toEqual(buildDesignGraphFromScene(stored))
  })

  it('exports an empty scene', () => {
    const graph = buildDesignGraphFromScene(scene([]))
    expect(graph).toMatchObject({ nodes: [], edges: [], annotations: [], groups: [] })
    expect(describeDesignGraph(graph)).toBe('Empty design: no components.')
  })

  it('is described by the existing text renderer', () => {
    expect(describeDesignGraph(buildDesignGraphFromScene(architectureScene()))).toBe(
      [
        'Components (6): Service A (service), Client, Load balancer, Users (database), Service B (service), Cache',
        'Connections:',
        '- Service A <-[SQL]-> Users',
        '- Client -[HTTPS]-> Load balancer -> Service A, Service B',
        '- Service B -- Users',
        '- Cache <- Service A',
        'Notes:',
        '- "Reads are ~100x writes" (near Users)',
        'Groups:',
        '- frame "Backend": Service A, Service B'
      ].join('\n')
    )
  })
})
