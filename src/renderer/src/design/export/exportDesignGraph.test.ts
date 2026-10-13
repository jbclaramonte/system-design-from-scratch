import { describe, expect, it } from 'vitest'
import { designGraphSchema } from '../../../../shared/designGraph'
import { toScene } from '../flow/flowModel'
import {
  architectureScene,
  branchingScene,
  chainScene,
  component,
  edge,
  group,
  note,
  scene
} from '../flow/sceneFixtures'
import { describeDesignGraph } from './describeDesignGraph'
import { exportDesignGraph } from './exportDesignGraph'

describe('exportDesignGraph', () => {
  it('maps a scene to a valid Design Graph', () => {
    const graph = exportDesignGraph(architectureScene())
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
    const graph = exportDesignGraph(architectureScene())
    expect(graph.nodes.find((n) => n.id === 'svc-a')).toMatchObject({
      position: { x: 440, y: 40 },
      size: { w: 160, h: 90 }
    })
    expect(graph.nodes.find((n) => n.id === 'svc-b')?.position).toEqual({ x: 440, y: 180 })
  })

  it('lists groups with every member at any depth, notes included', () => {
    const graph = exportDesignGraph(
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
    const near = exportDesignGraph(
      scene([component('a', 'cache', 0, 0), note('n', 200, 0, 'Hot keys')])
    )
    expect(near.annotations).toEqual([
      { id: 'n', kind: 'note', text: 'Hot keys', position: { x: 200, y: 0 }, nearestNodeId: 'a' }
    ])
    const far = exportDesignGraph(
      scene([component('a', 'cache', 0, 0), note('n', 2000, 2000, 'Elsewhere')])
    )
    expect(far.annotations[0]?.nearestNodeId).toBeNull()
  })

  it('leaves out notes without text', () => {
    const graph = exportDesignGraph(scene([note('n', 0, 0, '   ')]))
    expect(graph.annotations).toEqual([])
  })

  it('turns an edge without a component at one end into a dangling arrow', () => {
    const graph = exportDesignGraph(
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
    const graph = exportDesignGraph({
      nodes: [component('a', 'service', 0, 0)],
      edges: [edge('ghost', 'a', 'gone'), edge('both-gone', 'x', 'y')]
    })
    expect(graph.danglingArrows).toEqual([
      { id: 'ghost', from: 'a', to: null, label: '' },
      { id: 'both-gone', from: null, to: null, label: '' }
    ])
  })

  it('keeps a self loop and parallel edges', () => {
    const graph = exportDesignGraph(
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
    const expected = exportDesignGraph(base)
    expect(exportDesignGraph(shuffled)).toEqual(expected)
    expect(JSON.stringify(exportDesignGraph(shuffled))).toBe(JSON.stringify(expected))

    const jittered = scene([component('a', 'cache', -0.4, 0.4)])
    expect(exportDesignGraph(jittered).nodes[0]?.position).toEqual({ x: 0, y: 0 })
    expect(Object.is(exportDesignGraph(jittered).nodes[0]?.position?.x, -0)).toBe(false)
  })

  it('exports the same graph from the editor state and from the stored scene', () => {
    const stored = architectureScene()
    const state = toScene(
      stored.nodes.map((n) => ({ ...n, selected: true })) as never,
      stored.edges.map((e) => ({ ...e, type: 'link' })) as never,
      stored.viewport
    )
    expect(exportDesignGraph(state)).toEqual(exportDesignGraph(stored))
  })

  it('exports an empty scene', () => {
    const graph = exportDesignGraph(scene([]))
    expect(graph).toMatchObject({ nodes: [], edges: [], annotations: [], groups: [] })
    expect(describeDesignGraph(graph)).toBe('Empty design: no components.')
  })

  it('is described by the existing text renderer', () => {
    expect(describeDesignGraph(exportDesignGraph(architectureScene()))).toBe(
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

  // Ported from the tldraw fixture-scene tests (chain, branching, annotations, groups).
  describe('fixture scenes', () => {
    it('exports a simple chain: typed nodes and edges', () => {
      const graph = exportDesignGraph(chainScene())
      expect(graph.nodes).toEqual([
        {
          id: 'lb',
          componentType: 'load-balancer',
          label: 'Load balancer',
          position: { x: 0, y: 0 },
          size: { w: 160, h: 90 }
        },
        {
          id: 'svc',
          componentType: 'service',
          label: 'Service',
          position: { x: 300, y: 0 },
          size: { w: 160, h: 90 }
        },
        {
          id: 'db',
          componentType: 'database',
          label: 'Users',
          position: { x: 600, y: 0 },
          size: { w: 160, h: 90 }
        }
      ])
      expect(graph.edges).toEqual([
        { id: 'a1', from: 'lb', to: 'svc', label: '', direction: 'forward' },
        { id: 'a2', from: 'svc', to: 'db', label: 'SQL', direction: 'forward' }
      ])
      expect(graph).toMatchObject({ version: 1, annotations: [], danglingArrows: [], groups: [] })
      expect(designGraphSchema.parse(graph)).toEqual(graph)
    })

    it('exports a branching scene in reading order', () => {
      const graph = exportDesignGraph(branchingScene())
      expect(graph.nodes.map((n) => n.id)).toEqual([
        's1',
        'cache',
        'client',
        'lb',
        's2',
        'db',
        's3'
      ])
      expect(graph.edges).toHaveLength(10)
      expect(graph.edges.slice(0, 2).map((e) => `${e.from}->${e.to}`)).toEqual([
        's1->cache',
        's1->db'
      ])
      expect(designGraphSchema.safeParse(graph).success).toBe(true)
    })

    it('exports notes with their nearest component, and leaves empty ones out', () => {
      const graph = exportDesignGraph(
        scene([
          ...branchingScene().nodes,
          note('blank', 0, 600, ''),
          note('mobile', 0, 400, 'Mobile app')
        ])
      )
      expect(graph.annotations).toEqual([
        {
          id: 'n-reads',
          kind: 'note',
          text: 'Reads are ~100x writes',
          position: { x: 800, y: -40 },
          nearestNodeId: 'cache'
        },
        {
          id: 'mobile',
          kind: 'note',
          text: 'Mobile app',
          position: { x: 0, y: 400 },
          nearestNodeId: 'client'
        },
        {
          id: 'n-far',
          kind: 'note',
          text: 'Single region for now',
          position: { x: 2000, y: 2000 },
          nearestNodeId: null
        }
      ])
    })

    it('maps every direction of a connection', () => {
      const directions = ['forward', 'backward', 'both', 'none'] as const
      const graph = exportDesignGraph(
        scene(
          [component('a', 'service', 0, 0), component('b', 'service', 300, 0)],
          directions.map((d) => edge(d, 'a', 'b', d))
        )
      )
      expect(Object.fromEntries(graph.edges.map((e) => [e.id, e.direction]))).toEqual({
        backward: 'backward',
        both: 'both',
        forward: 'forward',
        none: 'none'
      })
    })

    it('exports a group as a frame and adds its offset to the positions', () => {
      const graph = exportDesignGraph(
        scene([
          group('f', 100, 50, 'Write path'),
          component('q', 'queue', 10, 20, 'Jobs', 'f'),
          note('w', 200, 20, 'worker pool', 'f'),
          component('out', 'database', 900, 0)
        ])
      )
      expect(graph.nodes.find((n) => n.id === 'q')?.position).toEqual({ x: 110, y: 70 })
      expect(graph.groups).toEqual([
        { id: 'f', kind: 'frame', label: 'Write path', memberIds: ['q', 'w'] }
      ])
    })

    it('is deterministic across exports, input orders and clones', () => {
      const base = branchingScene()
      const first = JSON.stringify(exportDesignGraph(base))
      expect(JSON.stringify(exportDesignGraph(base))).toBe(first)
      expect(
        JSON.stringify(
          exportDesignGraph({ nodes: [...base.nodes].reverse(), edges: [...base.edges].reverse() })
        )
      ).toBe(first)
      expect(JSON.stringify(exportDesignGraph(structuredClone(base)))).toBe(first)
    })
  })
})
