import { describe, expect, it } from 'vitest'
import { designExportSchema, designGraphSchema, type DesignGraph } from './designGraph'

/** 1x1 white PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

const graph: DesignGraph = {
  version: 1,
  nodes: [
    { id: 'shape:lb', componentType: 'load-balancer', label: 'LB', position: { x: 0, y: 0 } },
    { id: 'shape:db', componentType: 'database', label: 'DB' }
  ],
  edges: [{ id: 'shape:e', from: 'shape:lb', to: 'shape:db', label: '', direction: 'forward' }],
  annotations: [
    { id: 'shape:t', kind: 'text', text: 'note', nearestNodeId: 'shape:db' },
    { id: 'shape:u', kind: 'note', text: 'far', nearestNodeId: null }
  ],
  danglingArrows: [{ id: 'shape:d', from: 'shape:lb', to: null, label: '' }],
  groups: [{ id: 'shape:f', kind: 'frame', label: 'Data', memberIds: ['shape:db', 'shape:t'] }]
}

const exported = { designExerciseId: 3, graph, description: 'LB -> DB', png: null }

describe('designGraphSchema', () => {
  it('accepts a well-formed graph', () => {
    expect(designGraphSchema.parse(graph)).toEqual(graph)
  })

  it.each([
    ['an unknown version', { ...graph, version: 2 }],
    [
      'a type outside the shape catalogue',
      { ...graph, nodes: [{ ...graph.nodes[0], componentType: 'geo' }, graph.nodes[1]] }
    ],
    ['an edge to an unknown node', { ...graph, edges: [{ ...graph.edges[0], to: 'shape:x' }] }],
    ['an unknown direction', { ...graph, edges: [{ ...graph.edges[0], direction: 'sideways' }] }],
    [
      'a dangling arrow with a node at both ends',
      { ...graph, danglingArrows: [{ id: 'shape:d', from: 'shape:lb', to: 'shape:db', label: '' }] }
    ],
    [
      'a nearest node that does not exist',
      { ...graph, annotations: [{ ...graph.annotations[0], nearestNodeId: 'shape:x' }] }
    ],
    [
      'a group member that does not exist',
      { ...graph, groups: [{ ...graph.groups[0], memberIds: ['shape:x'] }] }
    ],
    ['duplicate ids', { ...graph, edges: [{ ...graph.edges[0], id: 'shape:lb' }] }],
    ['a missing list', { ...graph, groups: undefined }]
  ])('rejects %s', (_case, value) => {
    expect(designGraphSchema.safeParse(value).success).toBe(false)
  })
})

describe('designExportSchema', () => {
  it('accepts an export with or without a PNG', () => {
    const png = { base64: PNG_BASE64, width: 1, height: 1 }

    expect(designExportSchema.parse(exported)).toEqual(exported)
    expect(designExportSchema.parse({ ...exported, png })).toEqual({ ...exported, png })
  })

  it.each([
    ['a bad exercise id', { ...exported, designExerciseId: 0 }],
    ['a missing description', { ...exported, description: undefined }],
    ['a PNG that is not base64', { ...exported, png: { base64: '!!', width: 1, height: 1 } }],
    [
      'an image that is not a PNG',
      { ...exported, png: { base64: btoa('GIF89a....'), width: 1, height: 1 } }
    ],
    [
      'a data URL instead of raw base64',
      { ...exported, png: { base64: `data:image/png;base64,${PNG_BASE64}`, width: 1, height: 1 } }
    ],
    [
      'an image larger than the maximum',
      { ...exported, png: { base64: PNG_BASE64, width: 4000, height: 1 } }
    ],
    ['an invalid graph', { ...exported, graph: { ...graph, nodes: 'none' } }]
  ])('rejects %s', (_case, value) => {
    expect(designExportSchema.safeParse(value).success).toBe(false)
  })
})
