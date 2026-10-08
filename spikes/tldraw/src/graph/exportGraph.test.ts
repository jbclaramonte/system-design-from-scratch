import { describe, expect, it } from 'vitest'
import { fixtureBindings, fixtureShapes } from '../fixtures/scene'
import { buildGraph, richTextToPlain, type SceneBinding, type SceneShape } from './exportGraph'

const shapes = fixtureShapes as SceneShape[]
const bindings = fixtureBindings as SceneBinding[]

describe('buildGraph (fixture scene)', () => {
  const graph = buildGraph(shapes, bindings)

  it('exports typed nodes with labels and positions', () => {
    expect(graph.nodes.map((n) => [n.id, n.type, n.label])).toEqual([
      ['shape:client', 'generic', 'Client'],
      ['shape:lb', 'load-balancer', 'Load balancer'],
      ['shape:cache', 'cache', 'Cache'],
      ['shape:db', 'database', 'Database'],
      ['shape:queue', 'queue', 'Write queue'],
    ])
    expect(graph.nodes.find((n) => n.id === 'shape:db')).toMatchObject({
      position: { x: 720, y: 0 },
      size: { w: 160, h: 110 },
    })
  })

  it('exports edges from arrow bindings, start -> end', () => {
    expect(graph.edges.map((e) => `${e.from}->${e.to}:${e.label}`)).toEqual([
      'shape:cache->shape:db:cache miss',
      'shape:client->shape:lb:HTTPS',
      'shape:lb->shape:cache:GET /{id}',
      'shape:lb->shape:queue:POST /shorten',
      'shape:queue->shape:db:async drain',
    ])
  })

  it('exports free-text annotations', () => {
    expect(graph.annotations).toEqual([
      { id: 'shape:note1', kind: 'text', text: 'Reads are ~100x writes; cache TTL 1h.', position: { x: 240, y: 330 } },
      { id: 'shape:note2', kind: 'note', text: 'Single DB primary for now', position: { x: 640, y: 330 } },
    ])
    expect(graph.unconnectedArrows).toEqual([])
  })

  it('is deterministic and JSON round-trips', () => {
    const reordered = buildGraph([...shapes].reverse(), [...bindings].reverse())
    expect(reordered).toEqual(graph)
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph)
  })
})

describe('buildGraph (edge cases)', () => {
  it('reports arrows with an unbound end instead of inventing an edge', () => {
    const g = buildGraph(shapes, bindings.filter((b) => !(b.fromId === 'shape:e1' && b.props.terminal === 'end')))
    expect(g.edges.find((e) => e.id === 'shape:e1')).toBeUndefined()
    expect(g.unconnectedArrows).toEqual([{ id: 'shape:e1', label: 'HTTPS', from: 'shape:client', to: null }])
  })

  it('ignores arrows bound to annotations rather than nodes', () => {
    const g = buildGraph(shapes, [
      ...bindings.filter((b) => b.fromId !== 'shape:e1'),
      { type: 'arrow', fromId: 'shape:e1', toId: 'shape:client', props: { terminal: 'start' } },
      { type: 'arrow', fromId: 'shape:e1', toId: 'shape:note1', props: { terminal: 'end' } },
    ])
    expect(g.unconnectedArrows[0]).toMatchObject({ id: 'shape:e1', from: 'shape:client', to: null })
  })

  it('adds parent offsets for shapes inside a frame', () => {
    const g = buildGraph(
      [
        { id: 'shape:f', type: 'frame', x: 100, y: 50, props: {} },
        { id: 'shape:c', type: 'cache', x: 10, y: 5, parentId: 'shape:f', props: { w: 1, h: 1, text: 'C' } },
      ],
      []
    )
    expect(g.nodes[0]?.position).toEqual({ x: 110, y: 55 })
  })

  it('flattens multi-paragraph rich text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
      ],
    }
    expect(richTextToPlain(doc)).toBe('ab\nc')
    expect(richTextToPlain(undefined)).toBe('')
  })
})
