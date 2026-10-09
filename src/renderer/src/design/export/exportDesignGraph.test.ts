import type { Editor, TLEditorSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { designGraphSchema } from '../../../../shared/designGraph'
import { buildDesignGraph, exportDesignGraph, richTextToPlain } from './exportDesignGraph'
import {
  arrow,
  binding,
  branchingScene,
  chainScene,
  component,
  frame,
  geo,
  note,
  page,
  PAGE_ID,
  text,
  type FixtureRecord
} from './fixtureScenes'

const build = (records: FixtureRecord[]) => buildDesignGraph(records, PAGE_ID)

describe('buildDesignGraph', () => {
  it('exports a simple chain: typed nodes and bound edges', () => {
    const graph = build(chainScene())

    expect(graph.nodes).toEqual([
      {
        id: 'shape:lb',
        componentType: 'load-balancer',
        label: 'Load balancer',
        position: { x: 0, y: 0 },
        size: { w: 160, h: 90 }
      },
      {
        id: 'shape:svc',
        componentType: 'service',
        label: 'Service',
        position: { x: 300, y: 0 },
        size: { w: 160, h: 90 }
      },
      {
        id: 'shape:db',
        componentType: 'database',
        label: 'Users',
        position: { x: 600, y: 0 },
        size: { w: 160, h: 110 }
      }
    ])
    expect(graph.edges).toEqual([
      { id: 'shape:a1', from: 'shape:lb', to: 'shape:svc', label: '', direction: 'forward' },
      { id: 'shape:a2', from: 'shape:svc', to: 'shape:db', label: 'SQL', direction: 'forward' }
    ])
    expect(graph).toMatchObject({ version: 1, annotations: [], danglingArrows: [], groups: [] })
    expect(designGraphSchema.parse(graph)).toEqual(graph)
  })

  it('exports a branching scene in reading order', () => {
    const graph = build(branchingScene())

    expect(graph.nodes.map((n) => n.id)).toEqual([
      'shape:s1',
      'shape:cache',
      'shape:client',
      'shape:lb',
      'shape:s2',
      'shape:db',
      'shape:s3'
    ])
    expect(graph.edges).toHaveLength(10)
    expect(graph.edges.slice(0, 2).map((e) => `${e.from}->${e.to}`)).toEqual([
      'shape:s1->shape:cache',
      'shape:s1->shape:db'
    ])
    expect(designGraphSchema.safeParse(graph).success).toBe(true)
  })

  it('derives connections from bindings, not from stale arrow props', () => {
    const records = [
      page(),
      component('lb', 'load-balancer', 0, 0),
      component('db', 'database', 900, 500),
      // Stored points still where the arrow was drawn before the database moved.
      arrow('a', { start: { x: 5000, y: 5000 }, end: { x: -300, y: 42 } }),
      binding('a', 'start', 'lb'),
      binding('a', 'end', 'db')
    ]

    expect(build(records).edges).toEqual([
      { id: 'shape:a', from: 'shape:lb', to: 'shape:db', label: '', direction: 'forward' }
    ])
  })

  it('reports an arrow bound at one end only as dangling', () => {
    const records = [
      page(),
      component('lb', 'load-balancer', 0, 0),
      arrow('a', { label: 'to nowhere' }),
      binding('a', 'start', 'lb')
    ]
    const graph = build(records)

    expect(graph.edges).toEqual([])
    expect(graph.danglingArrows).toEqual([
      { id: 'shape:a', from: 'shape:lb', to: null, label: 'to nowhere' }
    ])
  })

  it('treats arrows bound to annotations, other arrows or unknown shapes as dangling', () => {
    const records = [
      page(),
      component('svc', 'service', 0, 0),
      text('t', 0, 300, 'a note'),
      arrow('to-text'),
      binding('to-text', 'start', 'svc'),
      binding('to-text', 'end', 't'),
      arrow('to-arrow'),
      binding('to-arrow', 'start', 'to-text'),
      binding('to-arrow', 'end', 'svc'),
      arrow('to-ghost'),
      binding('to-ghost', 'start', 'svc'),
      binding('to-ghost', 'end', 'deleted'),
      arrow('free')
    ]
    const graph = build(records)

    expect(graph.edges).toEqual([])
    expect(graph.danglingArrows).toEqual([
      { id: 'shape:to-ghost', from: 'shape:svc', to: null, label: '' },
      { id: 'shape:to-text', from: 'shape:svc', to: null, label: '' },
      { id: 'shape:to-arrow', from: null, to: 'shape:svc', label: '' },
      { id: 'shape:free', from: null, to: null, label: '' }
    ])
  })

  it('exports text, notes and labelled geo shapes as annotations with their nearest node', () => {
    const graph = build([
      ...branchingScene(),
      geo('g', 0, 400, 'Mobile app'),
      geo('empty', 0, 600, ''),
      {
        id: 'shape:scribble',
        typeName: 'shape',
        type: 'draw',
        x: 10,
        y: 10,
        parentId: PAGE_ID,
        props: { segments: [] }
      }
    ])

    expect(graph.annotations).toEqual([
      {
        id: 'shape:n-reads',
        kind: 'text',
        text: 'Reads are ~100x writes',
        position: { x: 800, y: 240 },
        nearestNodeId: 'shape:cache'
      },
      {
        id: 'shape:g',
        kind: 'geo',
        text: 'Mobile app',
        position: { x: 0, y: 400 },
        nearestNodeId: 'shape:client'
      },
      {
        id: 'shape:n-far',
        kind: 'note',
        text: 'Single region for now',
        position: { x: 2000, y: 2000 },
        nearestNodeId: null
      }
    ])
  })

  it('anchors annotations on measured bounds when given, else on note size', () => {
    const records = [
      page(),
      component('top', 'service', 0, 0),
      component('bottom', 'database', 0, 400),
      // Top-left corner close to "top", but the measured text spans down to "bottom".
      text('t', 0, 120, 'replicated'),
      note('n', 0, 180, 'sticky')
    ]

    const unmeasured = build(records).annotations
    const measured = buildDesignGraph(records, PAGE_ID, {
      pageBounds: (id) => (id === 'shape:t' ? { x: 0, y: 120, w: 160, h: 300 } : undefined)
    }).annotations

    expect(unmeasured.map((a) => a.nearestNodeId)).toEqual(['shape:top', 'shape:bottom'])
    expect(measured.map((a) => a.nearestNodeId)).toEqual(['shape:bottom', 'shape:bottom'])
  })

  it('returns an empty graph for an empty scene', () => {
    expect(build([page()])).toEqual({
      version: 1,
      nodes: [],
      edges: [],
      annotations: [],
      danglingArrows: [],
      groups: []
    })
    expect(buildDesignGraph([])).toEqual(build([page()]))
  })

  it('is deterministic: same JSON across exports and input orders', () => {
    const records = branchingScene()
    const first = JSON.stringify(build(records))

    expect(JSON.stringify(build(records))).toBe(first)
    expect(JSON.stringify(build([...records].reverse()))).toBe(first)
    expect(JSON.stringify(build(structuredClone(records)))).toBe(first)
  })

  it('maps arrowheads to a direction', () => {
    const records = [
      page(),
      component('a', 'service', 0, 0),
      component('b', 'service', 300, 0),
      arrow('back', { arrowheadStart: 'arrow', arrowheadEnd: 'none' }),
      arrow('both', { arrowheadStart: 'triangle', arrowheadEnd: 'arrow' }),
      arrow('line', { arrowheadEnd: 'none' }),
      ...['back', 'both', 'line'].flatMap((id) => [
        binding(id, 'start', 'a'),
        binding(id, 'end', 'b')
      ])
    ]

    expect(Object.fromEntries(build(records).edges.map((e) => [e.id, e.direction]))).toEqual({
      'shape:back': 'backward',
      'shape:both': 'both',
      'shape:line': 'none'
    })
  })

  it('exports frames as groups and adds parent offsets to positions', () => {
    const graph = build([
      page(),
      frame('f', 100, 50, 'Write path'),
      component('q', 'queue', 10, 20, 'Jobs', 'shape:f'),
      geo('g', 200, 20, 'worker pool', 'shape:f'),
      component('out', 'database', 900, 0)
    ])

    expect(graph.nodes.find((n) => n.id === 'shape:q')?.position).toEqual({ x: 110, y: 70 })
    expect(graph.groups).toEqual([
      { id: 'shape:f', kind: 'frame', label: 'Write path', memberIds: ['shape:q', 'shape:g'] }
    ])
  })

  it('keeps only the shapes of the requested page', () => {
    const graph = buildDesignGraph(
      [
        page(),
        page('page:other', 'a2'),
        component('db', 'database', 0, 0),
        {
          ...component('elsewhere', 'cache', 0, 0),
          parentId: 'page:other'
        }
      ],
      PAGE_ID
    )

    expect(graph.nodes.map((n) => n.id)).toEqual(['shape:db'])
  })

  it('flattens multi-paragraph rich text', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'c' }] }
      ]
    }

    expect(richTextToPlain(doc)).toBe('a\n\nc')
    expect(richTextToPlain(undefined)).toBe('')
  })
})

describe('exportDesignGraph', () => {
  const asStore = (records: FixtureRecord[]) =>
    Object.fromEntries(records.map((record) => [record.id, record]))

  it('reads a stored Design Scene (editor snapshot) on its current page', () => {
    const snapshot = {
      document: { store: asStore(chainScene()), schema: {} },
      session: { currentPageId: PAGE_ID }
    } as unknown as TLEditorSnapshot

    expect(exportDesignGraph(snapshot)).toEqual(build(chainScene()))
  })

  it('reads a live editor', () => {
    const editor = {
      store: { allRecords: () => chainScene() },
      getCurrentPageId: () => PAGE_ID,
      getShapePageBounds: () => undefined
    } as unknown as Editor

    expect(exportDesignGraph(editor)).toEqual(build(chainScene()))
  })
})
