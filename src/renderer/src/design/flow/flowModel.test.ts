import { describe, expect, it } from 'vitest'
import {
  absolutePosition,
  copySelection,
  createEdge,
  edgeMarkers,
  pasteClipboard,
  reparentDropped,
  sortParentsFirst,
  toFlow,
  toScene,
  type FlowNode
} from './flowModel'
import { architectureScene } from './sceneFixtures'

const flow = () => toFlow(architectureScene(), 'dark')
const byId = (nodes: FlowNode[]) => new Map(nodes.map((node) => [node.id, node]))

describe('flow model', () => {
  it('converts a scene to editor state and back without loss', () => {
    const original = architectureScene()
    const { nodes, edges, viewport } = toFlow(original, 'dark')
    const stored = toScene(nodes, edges, viewport)
    const byName = (list: { id: string }[]) => [...list].sort((x, y) => (x.id < y.id ? -1 : 1))
    expect({ ...stored, nodes: byName(stored.nodes) }).toEqual({
      ...original,
      nodes: byName(original.nodes)
    })
    // The drawing order is the sorted one, and it is stable from then on.
    const again = toFlow(stored, 'dark')
    expect(toScene(again.nodes, again.edges, again.viewport)).toEqual(stored)
  })

  it('derives the arrowheads from the direction, in the color of the mode', () => {
    expect(edgeMarkers('none', 'dark')).toEqual({ markerStart: undefined, markerEnd: undefined })
    expect(edgeMarkers('forward', 'export').markerEnd).toMatchObject({ color: '#334155' })
    expect(edgeMarkers('forward', 'export').markerStart).toBeUndefined()
    expect(edgeMarkers('backward', 'export').markerEnd).toBeUndefined()
    expect(edgeMarkers('backward', 'export').markerStart).toBeDefined()
    const both = edgeMarkers('both', 'dark')
    expect(both.markerStart && both.markerEnd).toBeTruthy()
    const edge = createEdge('e', { source: 'a', target: 'b' }, 'dark', {
      label: '',
      direction: 'both'
    })
    expect(edge.markerStart && edge.markerEnd).toBeTruthy()
  })

  it('puts parents before children and groups behind their level', () => {
    const { nodes } = flow()
    const shuffled = [
      nodes[3]!,
      nodes[7]!,
      nodes[2]!,
      nodes[0]!,
      nodes[1]!,
      nodes[4]!,
      nodes[5]!,
      nodes[6]!
    ]
    const sorted = sortParentsFirst(shuffled).map((node) => node.id)
    expect(sorted.indexOf('g-backend')).toBeLessThan(sorted.indexOf('svc-a'))
    expect(sorted.indexOf('g-backend')).toBeLessThan(sorted.indexOf('client'))
    expect(sorted.indexOf('client')).toBeLessThan(sorted.indexOf('svc-a'))
  })

  it('computes absolute positions through nested groups', () => {
    const { nodes } = flow()
    expect(absolutePosition(byId(nodes).get('svc-a')!, byId(nodes))).toEqual({ x: 440, y: 40 })
  })

  describe('reparentDropped', () => {
    it('puts a dropped component into the group under its center, keeping its place on the canvas', () => {
      const { nodes } = flow()
      // The cache is dropped with its center at (480, 120), inside the Backend group.
      const dropped = nodes.map((n) =>
        n.id === 'cache' ? { ...n, position: { x: 400, y: 75 } } : n
      )
      const result = reparentDropped(dropped, new Set(['cache']))
      const cache = byId(result).get('cache')!
      expect(cache.parentId).toBe('g-backend')
      expect(cache.position).toEqual({ x: 0, y: 75 })
      expect(absolutePosition(cache, byId(result))).toEqual({ x: 400, y: 75 })
      // Parent comes first again.
      expect(result.findIndex((n) => n.id === 'g-backend')).toBeLessThan(
        result.findIndex((n) => n.id === 'cache')
      )
    })

    it('takes a component out of its group when it is dropped outside', () => {
      const { nodes } = flow()
      const dropped = nodes.map((n) =>
        n.id === 'svc-a' ? { ...n, position: { x: -600, y: 40 } } : n
      )
      const svc = byId(reparentDropped(dropped, new Set(['svc-a']))).get('svc-a')!
      expect(svc.parentId).toBeUndefined()
      expect(svc.position).toEqual({ x: -200, y: 40 })
    })

    it('picks the innermost group and leaves nodes dragged with their group alone', () => {
      const { nodes } = flow()
      const inner: FlowNode = {
        id: 'g-inner',
        type: 'group',
        position: { x: 200, y: 200 },
        width: 100,
        height: 100,
        parentId: 'g-backend',
        data: { label: 'Zone' }
      }
      const withInner = sortParentsFirst([...nodes, inner])
      const dropped = withInner.map((n) =>
        n.id === 'cache' ? { ...n, position: { x: 600 + 20, y: 200 + 20 } } : n
      )
      // Absolute inner group: (600, 200) to (700, 300). Cache center: (700, 265) -> inside.
      expect(byId(reparentDropped(dropped, new Set(['cache']))).get('cache')?.parentId).toBe(
        'g-inner'
      )

      const same = reparentDropped(withInner, new Set(['svc-a', 'g-backend']))
      expect(byId(same).get('svc-a')?.parentId).toBe('g-backend')
      expect(byId(same).get('svc-a')?.position).toEqual({ x: 40, y: 40 })
    })

    it('never moves a group into another one', () => {
      const { nodes } = flow()
      const result = reparentDropped(nodes, new Set(['g-backend']))
      expect(result.find((n) => n.id === 'g-backend')?.parentId).toBeUndefined()
    })
  })

  describe('copy and paste', () => {
    const ids = () => {
      let n = 0
      return () => `copy-${++n}`
    }
    const select = (selected: string[]) =>
      flow().nodes.map((n) => ({ ...n, selected: selected.includes(n.id) }))

    it('copies the selection with the edges between selected nodes only', () => {
      const { edges } = flow()
      const clip = copySelection(select(['client', 'lb', 'db']), edges)
      expect(clip.nodes.map((n) => n.id)).toEqual(['client', 'lb', 'db'])
      expect(clip.edges.map((e) => e.id)).toEqual(['e1'])
    })

    it('stores a child copied without its group at its canvas position', () => {
      const clip = copySelection(select(['svc-a']), flow().edges)
      expect(clip.nodes[0]?.parentId).toBeUndefined()
      expect(clip.nodes[0]?.position).toEqual({ x: 440, y: 40 })
    })

    it('copies the content of a selected group and keeps it attached to the copy', () => {
      const clip = copySelection(select(['g-backend']), flow().edges)
      expect(clip.nodes.map((n) => n.id)).toEqual(['g-backend', 'svc-a', 'svc-b'])
      const pasted = pasteClipboard(clip, ids(), 'dark')
      const copiedGroup = pasted.nodes.find((n) => n.type === 'group')!
      const children = pasted.nodes.filter((n) => n.type === 'component')
      expect(children.every((n) => n.parentId === copiedGroup.id)).toBe(true)
      expect(copiedGroup.position).toEqual({ x: 432, y: 32 })
      expect(children.map((n) => n.position)).toEqual([
        { x: 40, y: 40 },
        { x: 40, y: 180 }
      ])
      expect(pasted.nodes[0]?.id).toBe(copiedGroup.id)
    })

    it('pastes with new ids, an offset, new edges between the copies and a fresh selection', () => {
      const { edges } = flow()
      const clip = copySelection(select(['client', 'lb']), edges)
      const pasted = pasteClipboard(clip, ids(), 'export')
      expect(pasted.nodes.map((n) => [n.id, n.position, n.selected])).toEqual([
        ['copy-1', { x: 32, y: 132 }, true],
        ['copy-2', { x: 232, y: 132 }, true]
      ])
      expect(pasted.edges).toHaveLength(1)
      expect(pasted.edges[0]).toMatchObject({
        id: 'copy-3',
        source: 'copy-1',
        target: 'copy-2',
        data: { label: 'HTTPS', direction: 'forward' }
      })
      // Nothing of the clipboard was touched.
      expect(clip.nodes.map((n) => n.id)).toEqual(['client', 'lb'])
    })
  })
})
