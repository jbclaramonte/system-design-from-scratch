import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { designGraphSchema } from '../../../../shared/designGraph'
import type { Json } from '../../../../shared/json'
import { exportDesignGraph } from '../export/exportDesignGraph'
import { EMPTY_SCENE, InvalidSceneError, serializeScene, type Scene } from '../flow/scene'
import { readStoredScene } from '../storedScene'
import {
  convertTldrawSnapshot,
  isLegacyTldrawSnapshot,
  LegacySceneError,
  richTextToPlain
} from './tldrawScene'
import {
  arrow,
  binding,
  branchingScene,
  chainScene,
  component,
  frame,
  geo,
  link,
  note,
  page,
  PAGE_ID,
  text,
  type FixtureRecord
} from './tldrawFixtures'

/** A stored tldraw editor snapshot (`getSnapshot(editor.store)`) around plain records. */
const snapshotOf = (records: FixtureRecord[], currentPageId: string = PAGE_ID): Json =>
  JSON.parse(
    JSON.stringify({
      document: {
        store: Object.fromEntries(records.map((record) => [record.id, record])),
        schema: { schemaVersion: 2, sequences: {} }
      },
      session: { version: 0, currentPageId, pageStates: [] }
    })
  ) as Json

const convert = (records: FixtureRecord[], currentPageId?: string) =>
  convertTldrawSnapshot(snapshotOf(records, currentPageId))
const graphOf = (records: FixtureRecord[]) => exportDesignGraph(convert(records).scene)

/** More shapes than a scene can hold (2,000 nodes). */
const tooManyShapes = () => [
  page(),
  ...Array.from({ length: 2001 }, (_, i) => component(`c${i}`, 'service', i, 0))
]

describe('isLegacyTldrawSnapshot', () => {
  it('recognizes a tldraw snapshot, and not a scene or anything else', () => {
    expect(isLegacyTldrawSnapshot(snapshotOf(chainScene()))).toBe(true)
    expect(isLegacyTldrawSnapshot(serializeScene(EMPTY_SCENE))).toBe(false)
    expect(isLegacyTldrawSnapshot({ document: { store: {} } })).toBe(false)
    expect(isLegacyTldrawSnapshot([])).toBe(false)
    expect(isLegacyTldrawSnapshot('x')).toBe(false)
    expect(isLegacyTldrawSnapshot(null)).toBe(false)
  })
})

describe('convertTldrawSnapshot', () => {
  it('converts a chain: typed nodes, positions, sizes, edges with facing handles', () => {
    const { scene, warnings } = convert(chainScene())

    expect(warnings).toEqual([])
    expect(scene.version).toBe(1)
    // The fixtures share one tldraw `index`, so the z-order falls back to the id.
    expect(Object.fromEntries(scene.nodes.map((n) => [n.id, n]))).toEqual({
      'shape:lb': {
        id: 'shape:lb',
        type: 'component',
        position: { x: 0, y: 0 },
        width: 160,
        height: 90,
        data: { componentType: 'load-balancer', label: 'Load balancer' }
      },
      'shape:svc': {
        id: 'shape:svc',
        type: 'component',
        position: { x: 300, y: 0 },
        width: 160,
        height: 90,
        data: { componentType: 'service', label: 'Service' }
      },
      'shape:db': {
        id: 'shape:db',
        type: 'component',
        position: { x: 600, y: 0 },
        width: 160,
        height: 110,
        data: { componentType: 'database', label: 'Users' }
      }
    })
    expect(scene.edges).toEqual([
      {
        id: 'shape:a1',
        source: 'shape:lb',
        target: 'shape:svc',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { label: '', direction: 'forward' }
      },
      {
        id: 'shape:a2',
        source: 'shape:svc',
        target: 'shape:db',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: { label: 'SQL', direction: 'forward' }
      }
    ])
    // The content starts at a fixed margin from the corner of the view.
    expect(scene.viewport).toEqual({ x: 48, y: 48, zoom: 1 })
  })

  it('produces a scene that passes the strict scene format and the Design Graph schema', () => {
    for (const records of [chainScene(), branchingScene()]) {
      const { scene } = convert(records)
      expect(() => serializeScene(scene)).not.toThrow()
      expect(designGraphSchema.safeParse(exportDesignGraph(scene)).success).toBe(true)
    }
  })

  it('gives the same Design Graph as the tldraw export did for the chain', () => {
    const graph = graphOf(chainScene())

    expect(graph.nodes.map((n) => [n.id, n.componentType, n.label, n.position, n.size])).toEqual([
      ['shape:lb', 'load-balancer', 'Load balancer', { x: 0, y: 0 }, { w: 160, h: 90 }],
      ['shape:svc', 'service', 'Service', { x: 300, y: 0 }, { w: 160, h: 90 }],
      ['shape:db', 'database', 'Users', { x: 600, y: 0 }, { w: 160, h: 110 }]
    ])
    expect(graph.edges).toEqual([
      { id: 'shape:a1', from: 'shape:lb', to: 'shape:svc', label: '', direction: 'forward' },
      { id: 'shape:a2', from: 'shape:svc', to: 'shape:db', label: 'SQL', direction: 'forward' }
    ])
    expect(graph).toMatchObject({ annotations: [], danglingArrows: [], groups: [] })
  })

  it('converts a branching scene with a text and a note, nodes and edges intact', () => {
    const { scene } = convert(branchingScene())
    const graph = exportDesignGraph(scene)

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
    expect(graph.annotations.map((a) => [a.id, a.kind, a.text])).toEqual([
      ['shape:n-reads', 'note', 'Reads are ~100x writes'],
      ['shape:n-far', 'note', 'Single region for now']
    ])
    expect(graph.annotations[1]?.nearestNodeId).toBeNull()
  })

  it('derives connections from bindings, not from stale arrow props', () => {
    const { scene } = convert([
      page(),
      component('lb', 'load-balancer', 0, 0),
      component('db', 'database', 900, 500),
      arrow('a', { start: { x: 5000, y: 5000 }, end: { x: -300, y: 42 } }),
      binding('a', 'start', 'lb'),
      binding('a', 'end', 'db')
    ])

    expect(scene.edges).toHaveLength(1)
    expect(scene.edges[0]).toMatchObject({ source: 'shape:lb', target: 'shape:db' })
    // Mostly to the right: the arrow leaves on the right and enters on the left.
    expect(scene.edges[0]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' })
  })

  it('picks facing handles from the relative position of the two nodes', () => {
    const edgeBetween = (bx: number, by: number) =>
      convert([
        page(),
        component('a', 'service', 0, 0),
        component('b', 'service', bx, by),
        ...link('e', 'a', 'b')
      ]).scene.edges[0]!
    expect(edgeBetween(0, 400)).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' })
    expect(edgeBetween(0, -400)).toMatchObject({ sourceHandle: 'top', targetHandle: 'bottom' })
    expect(edgeBetween(-400, 0)).toMatchObject({ sourceHandle: 'left', targetHandle: 'right' })
  })

  it('maps arrowheads to a direction', () => {
    const { scene } = convert([
      page(),
      component('a', 'service', 0, 0),
      component('b', 'service', 300, 0),
      arrow('back', { arrowheadStart: 'arrow', arrowheadEnd: 'none' }),
      arrow('both', { arrowheadStart: 'triangle', arrowheadEnd: 'arrow' }),
      arrow('line', { arrowheadEnd: 'none' }),
      arrow('plain'),
      ...['back', 'both', 'line', 'plain'].flatMap((id) => [
        binding(id, 'start', 'a'),
        binding(id, 'end', 'b')
      ])
    ])

    expect(Object.fromEntries(scene.edges.map((e) => [e.id, e.data.direction]))).toEqual({
      'shape:back': 'backward',
      'shape:both': 'both',
      'shape:line': 'none',
      'shape:plain': 'forward'
    })
  })

  it('drops arrows without a node at both ends and says so', () => {
    const { scene, warnings } = convert([
      page(),
      component('lb', 'load-balancer', 0, 0),
      component('svc', 'service', 300, 0),
      ...link('ok', 'lb', 'svc'),
      arrow('one-end', { label: 'to nowhere' }),
      binding('one-end', 'start', 'lb'),
      arrow('free'),
      arrow('to-arrow'),
      binding('to-arrow', 'start', 'lb'),
      binding('to-arrow', 'end', 'one-end'),
      arrow('to-ghost'),
      binding('to-ghost', 'start', 'lb'),
      binding('to-ghost', 'end', 'deleted'),
      frame('f', 0, 600, 'Zone'),
      arrow('to-frame'),
      binding('to-frame', 'start', 'lb'),
      binding('to-frame', 'end', 'f')
    ])

    expect(scene.edges.map((e) => e.id)).toEqual(['shape:ok'])
    expect(warnings).toEqual([
      '5 arrows not attached to a component or a note at both ends were not kept.'
    ])
  })

  it('turns an arrow bound to a text into a connection to a note (reported as dangling by the export)', () => {
    const records = [
      page(),
      component('svc', 'service', 0, 0),
      text('t', 0, 300, 'a note'),
      ...link('to-text', 'svc', 't')
    ]
    const { scene } = convert(records)
    expect(scene.edges.map((e) => [e.source, e.target])).toEqual([['shape:svc', 'shape:t']])
    expect(exportDesignGraph(scene).danglingArrows).toEqual([
      { id: 'shape:to-text', from: 'shape:svc', to: null, label: '' }
    ])
  })

  it('keeps text, notes and labelled geo shapes as notes, drops what has no text', () => {
    const { scene, warnings } = convert([
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
    const graph = exportDesignGraph(scene)

    expect(graph.annotations.map((a) => [a.id, a.text, a.nearestNodeId])).toEqual([
      ['shape:n-reads', 'Reads are ~100x writes', 'shape:db'],
      ['shape:g', 'Mobile app', 'shape:client'],
      ['shape:n-far', 'Single region for now', null]
    ])
    expect(scene.nodes.find((n) => n.id === 'shape:g')).toMatchObject({
      type: 'note',
      width: 120,
      height: 60
    })
    expect(scene.nodes.find((n) => n.id === 'shape:n-far')).toMatchObject({
      type: 'note',
      width: 200,
      height: 200
    })
    expect(warnings).toEqual([
      '2 shapes without text (freehand strokes, empty boxes) were not kept.'
    ])
  })

  it('sizes notes like tldraw did (200 units, times their scale) and estimates text height', () => {
    const scaled = note('big', 0, 0, 'Scaled')
    scaled.props = { ...(scaled.props as object), scale: 2 }
    const { scene } = convert([
      page(),
      note('n', 0, 0, 'Plain'),
      scaled,
      text('t', 0, 500, 'a\nb\nc')
    ])

    const sizes = Object.fromEntries(scene.nodes.map((n) => [n.id, [n.width, n.height]]))
    expect(sizes).toEqual({
      'shape:n': [200, 200],
      'shape:big': [400, 400],
      'shape:t': [200, 90]
    })
  })

  it('converts frames to groups with their content, positions relative to the frame', () => {
    const { scene } = convert([
      page(),
      frame('f', 100, 50, 'Write path'),
      component('q', 'queue', 10, 20, 'Jobs', 'shape:f'),
      geo('g', 200, 20, 'worker pool', 'shape:f'),
      component('out', 'database', 900, 0)
    ])

    expect(
      Object.fromEntries(
        scene.nodes.map((n) => [n.id, [n.type, n.parentId, n.position.x, n.position.y]])
      )
    ).toEqual({
      'shape:f': ['group', undefined, 100, 50],
      'shape:q': ['component', 'shape:f', 10, 20],
      'shape:g': ['note', 'shape:f', 200, 20],
      'shape:out': ['component', undefined, 900, 0]
    })
    // The frame comes first: React Flow needs a parent before its children.
    expect(scene.nodes[0]?.id).toBe('shape:f')
    expect(scene.nodes[0]).toMatchObject({ width: 600, height: 400, data: { label: 'Write path' } })

    const graph = exportDesignGraph(scene)
    expect(graph.nodes.find((n) => n.id === 'shape:q')?.position).toEqual({ x: 110, y: 70 })
    expect(graph.groups).toEqual([
      { id: 'shape:f', kind: 'frame', label: 'Write path', memberIds: ['shape:q', 'shape:g'] }
    ])
  })

  it('flattens a tldraw group into its frame (or the canvas), keeping absolute places', () => {
    const grouped = (id: string, x: number, y: number, parentId: string) => ({
      id: `shape:${id}`,
      typeName: 'shape',
      type: 'group',
      x,
      y,
      parentId,
      index: 'a1',
      props: {}
    })
    const { scene } = convert([
      page(),
      frame('f', 100, 100, 'Zone'),
      grouped('grp', 30, 40, 'shape:f'),
      component('inner', 'cache', 5, 6, 'Cache', 'shape:grp'),
      grouped('loose', 200, 200, PAGE_ID),
      component('free', 'service', 1, 2, 'Svc', 'shape:loose')
    ])

    expect(scene.nodes.find((n) => n.id === 'shape:inner')).toMatchObject({
      parentId: 'shape:f',
      position: { x: 35, y: 46 }
    })
    expect(scene.nodes.find((n) => n.id === 'shape:free')).toMatchObject({
      position: { x: 201, y: 202 }
    })
    expect(scene.nodes.find((n) => n.id === 'shape:free')?.parentId).toBeUndefined()
    expect(scene.nodes.some((n) => n.id === 'shape:grp')).toBe(false)
  })

  it('writes a frame before its content, nested frames in depth order', () => {
    const { scene } = convert([
      page(),
      { ...component('late', 'cache', 0, 0, 'C', 'shape:inner'), index: 'a0' },
      { ...frame('inner', 10, 10, 'Inner'), parentId: 'shape:outer', index: 'a1' },
      { ...frame('outer', 0, 0, 'Outer'), index: 'a2' }
    ])

    expect(scene.nodes.map((n) => n.id)).toEqual(['shape:outer', 'shape:inner', 'shape:late'])
    expect(scene.nodes[1]?.parentId).toBe('shape:outer')
    expect(() => serializeScene(scene)).not.toThrow()
  })

  it('keeps only the shapes of the page the snapshot was showing', () => {
    const records = [
      page(),
      page('page:other', 'a2'),
      component('db', 'database', 0, 0),
      { ...component('elsewhere', 'cache', 0, 0), parentId: 'page:other' }
    ]

    expect(convert(records).scene.nodes.map((n) => n.id)).toEqual(['shape:db'])
    expect(convert(records, 'page:other').scene.nodes.map((n) => n.id)).toEqual(['shape:elsewhere'])
    // An unknown current page falls back to the first page.
    expect(convert(records, 'page:gone').scene.nodes.map((n) => n.id)).toEqual(['shape:db'])
  })

  it('converts an empty page to an empty scene', () => {
    const { scene, warnings } = convert([page()])
    expect(scene).toEqual(EMPTY_SCENE)
    expect(warnings).toEqual([])
  })

  it('is deterministic: the same snapshot, in any record order, gives the same scene', () => {
    const records = branchingScene()
    const first = JSON.stringify(convert(records).scene)
    expect(JSON.stringify(convert(records).scene)).toBe(first)
    expect(JSON.stringify(convert([...records].reverse()).scene)).toBe(first)
  })

  it('throws a LegacySceneError for what is not a tldraw snapshot or cannot be a scene', () => {
    expect(() => convertTldrawSnapshot({ nope: true })).toThrow(LegacySceneError)
    expect(() => convertTldrawSnapshot(null)).toThrow(LegacySceneError)
    expect(() => convert(tooManyShapes())).toThrow(LegacySceneError)
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

describe('a real snapshot of tldraw 5.5.2', () => {
  // Drawn in the app with the tldraw canvas of issue #12 (real mouse and keyboard): five
  // components, four arrows between them, a free arrow, an empty frame, a text and a note.
  const snapshot = JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures/tldraw-5.5.2-snapshot.json'), 'utf8')
  ) as Json

  it('converts to a valid scene with the components, connections and annotations', () => {
    const { scene, warnings } = convertTldrawSnapshot(snapshot)

    expect(() => serializeScene(scene)).not.toThrow()
    const graph = exportDesignGraph(scene)
    expect(graph.nodes.map((n) => [n.componentType, n.label]).sort()).toEqual([
      ['cache', 'Cache'],
      ['client', 'Client'],
      ['database', 'Database'],
      ['load-balancer', 'Load balancer'],
      ['service', 'Service']
    ])
    expect(graph.edges.map((e) => [e.direction, e.label])).toEqual([
      ['forward', ''],
      ['forward', ''],
      ['forward', ''],
      ['forward', '']
    ])
    const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label
    expect(graph.edges.map((e) => `${labelOf(e.from)} -> ${labelOf(e.to)}`).sort()).toEqual([
      'Client -> Load balancer',
      'Load balancer -> Cache',
      'Load balancer -> Service',
      'Service -> Database'
    ])
    expect(graph.annotations.map((a) => a.text).sort()).toEqual([
      'Reads are heavy',
      'single region'
    ])
    // The empty frame is kept as an empty group; the arrow with a free end cannot be.
    expect(graph.groups).toMatchObject([{ kind: 'frame', label: '', memberIds: [] }])
    expect(warnings).toEqual([
      '1 arrow not attached to a component or a note at both ends was not kept.'
    ])
  })

  it('restores the view the learner left (tldraw camera) and puts the frame behind', () => {
    const { scene } = convertTldrawSnapshot(snapshot)
    expect(scene.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(scene.nodes[0]?.type).toBe('group')
  })

  it('applies a zoomed camera: screen = (page + camera) * zoom', () => {
    const zoomed = structuredClone(snapshot) as {
      session: { pageStates: Array<{ camera: { x: number; y: number; z: number } }> }
    }
    zoomed.session.pageStates[0]!.camera = { x: -100, y: 50, z: 0.5 }
    expect(convertTldrawSnapshot(zoomed).scene.viewport).toEqual({ x: -50, y: 25, zoom: 0.5 })
  })
})

describe('readStoredScene', () => {
  it('reports nothing stored, a current scene, and a converted tldraw scene', () => {
    expect(readStoredScene(null)).toEqual({ status: 'empty' })

    const scene: Scene = { ...EMPTY_SCENE, viewport: { x: 5, y: 6, zoom: 2 } }
    expect(readStoredScene(serializeScene(scene))).toEqual({ status: 'scene', scene })

    const converted = readStoredScene(snapshotOf(chainScene()))
    expect(converted).toMatchObject({ status: 'converted', warnings: [] })
    expect(converted.status === 'converted' && converted.scene.nodes).toHaveLength(3)
  })

  it('reports a tldraw scene that cannot be converted, without throwing', () => {
    const broken = readStoredScene(snapshotOf(tooManyShapes()))
    expect(broken).toMatchObject({ status: 'legacy' })
    expect(broken.status === 'legacy' && broken.reason).toMatch(/not valid/)
  })

  it('throws for any other value, so the caller shows an error and never overwrites it', () => {
    expect(() => readStoredScene({ version: 2, nodes: [] })).toThrow(InvalidSceneError)
    expect(() => readStoredScene({ hello: 'world' })).toThrow(InvalidSceneError)
    expect(() => readStoredScene([])).toThrow(InvalidSceneError)
    expect(() => readStoredScene('text')).toThrow(InvalidSceneError)
  })
})
