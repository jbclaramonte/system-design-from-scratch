import type { Editor, TLEditorSnapshot, TLShapeId, TLStoreSnapshot } from 'tldraw'
import {
  DESIGN_GRAPH_VERSION,
  isComponentType,
  type DesignGraph,
  type DesignGraphAnnotation,
  type DesignGraphDanglingArrow,
  type DesignGraphEdge,
  type DesignGraphGroup,
  type DesignGraphNode,
  type EdgeDirection
} from '../../../../shared/designGraph'

/**
 * Design Scene to Design Graph. Reads plain tldraw records only (no editor method beyond
 * `store.allRecords()` and `getCurrentPageId()`, no DOM), so it runs in unit tests.
 *
 * Connections come from arrow **binding records**, never from the arrow's `props.start` /
 * `props.end`: those go stale once a bound shape moves (see docs/spikes/tldraw.md, gotcha 1).
 */

/** An annotation further than this (page units) from every node has no nearest node. */
export const NEAREST_NODE_MAX_DISTANCE = 200

/** Size of a tldraw note at scale 1; notes store no `w` / `h`. */
const NOTE_SIZE = 200

/** Any record of a tldraw store, as found in a snapshot. Only the fields read here are typed. */
interface SceneRecord {
  id: string
  typeName: string
  type?: unknown
  [key: string]: unknown
}

interface SceneShape {
  id: string
  type: string
  x: number
  y: number
  parentId: string | null
  props: Record<string, unknown>
}

interface SceneBinding {
  fromId: string
  toId: string
  terminal: 'start' | 'end'
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/** Rounded, and never -0 (so two exports of the same scene compare equal). */
const round = (value: number) => Math.round(value) || 0

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Flattens a tldraw rich text value (ProseMirror JSON) into plain text, one line per block. */
export function richTextToPlain(richText: unknown): string {
  if (!isObject(richText) || !Array.isArray(richText['content'])) return ''
  const inline = (node: unknown): string => {
    if (!isObject(node)) return ''
    if (node['type'] === 'text') return typeof node['text'] === 'string' ? node['text'] : ''
    if (node['type'] === 'hardBreak') return '\n'
    return Array.isArray(node['content']) ? node['content'].map(inline).join('') : ''
  }
  return richText['content'].map(inline).join('\n').trim()
}

/** Text of a shape: plain `text` (component shapes), `richText` (built-in shapes), frame `name`. */
function textOf(shape: SceneShape): string {
  const { text, richText, name } = shape.props
  if (typeof text === 'string') return text.trim()
  if (richText !== undefined) return richTextToPlain(richText)
  if (typeof name === 'string') return name.trim()
  return ''
}

function toShape(record: SceneRecord): SceneShape | null {
  if (typeof record.type !== 'string') return null
  return {
    id: record.id,
    type: record.type,
    x: finite(record['x']) ?? 0,
    y: finite(record['y']) ?? 0,
    parentId: typeof record['parentId'] === 'string' ? record['parentId'] : null,
    props: isObject(record['props']) ? record['props'] : {}
  }
}

function toBinding(record: SceneRecord): SceneBinding | null {
  const { fromId, toId, props } = record
  const terminal = isObject(props) ? props['terminal'] : undefined
  if (record.type !== 'arrow' || typeof fromId !== 'string' || typeof toId !== 'string') return null
  if (terminal !== 'start' && terminal !== 'end') return null
  return { fromId, toId, terminal }
}

function directionOf(shape: SceneShape): EdgeDirection {
  const { arrowheadStart, arrowheadEnd } = shape.props
  // tldraw defaults: no head at the start, an arrow head at the end.
  const start = (arrowheadStart ?? 'none') !== 'none'
  const end = (arrowheadEnd ?? 'arrow') !== 'none'
  if (start && end) return 'both'
  if (end) return 'forward'
  if (start) return 'backward'
  return 'none'
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface BuildDesignGraphOptions {
  /**
   * Page bounds of a shape, as the editor measures them (`editor.getShapePageBounds`). Used to
   * find the node nearest to an annotation; without it, the size comes from the shape props
   * (text shapes store no height, so their top-left corner is used).
   */
  pageBounds?: (shapeId: string) => Rect | undefined
}

function distanceToRect(px: number, py: number, rect: Rect): number {
  const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.w))
  const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.h))
  return Math.hypot(dx, dy)
}

const byPosition = (
  a: { id: string; position?: { x: number; y: number } },
  b: { id: string; position?: { x: number; y: number } }
) =>
  (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
  (a.position?.x ?? 0) - (b.position?.x ?? 0) ||
  compareStrings(a.id, b.id)

/**
 * Builds the Design Graph of one page from tldraw store records (shapes, bindings, pages...).
 * `pageId` limits the graph to the shapes of that page; `null` keeps every shape.
 * The same records always give the same graph, in any input order.
 */
export function buildDesignGraph(
  records: readonly unknown[],
  pageId: string | null = null,
  { pageBounds }: BuildDesignGraphOptions = {}
): DesignGraph {
  const sceneRecords = records.filter(
    (record): record is SceneRecord =>
      isObject(record) && typeof record['id'] === 'string' && typeof record['typeName'] === 'string'
  )
  const allShapes = new Map<string, SceneShape>()
  for (const record of sceneRecords) {
    const shape = record.typeName === 'shape' ? toShape(record) : null
    if (shape) allShapes.set(shape.id, shape)
  }

  /** Shape ancestors, innermost first, plus the id the chain ends on (the page). */
  const ancestry = (shape: SceneShape) => {
    const ancestors: SceneShape[] = []
    let parentId = shape.parentId
    let parent = parentId ? allShapes.get(parentId) : undefined
    while (parent && ancestors.length < allShapes.size) {
      ancestors.push(parent)
      parentId = parent.parentId
      parent = parentId ? allShapes.get(parentId) : undefined
    }
    return { ancestors, rootId: parentId }
  }

  const shapes = [...allShapes.values()]
    .filter((shape) => pageId === null || ancestry(shape).rootId === pageId)
    .sort((a, b) => compareStrings(a.id, b.id))

  // Page coordinates: parent offsets summed up the chain (rotation ignored).
  const positionOf = (shape: SceneShape) => {
    let { x, y } = shape
    for (const ancestor of ancestry(shape).ancestors) {
      x += ancestor.x
      y += ancestor.y
    }
    return { x: round(x), y: round(y) }
  }
  const sizeOf = (shape: SceneShape) => {
    const w = finite(shape.props['w'])
    const h = finite(shape.props['h'])
    return w !== undefined && h !== undefined && w >= 0 && h >= 0
      ? { w: round(w), h: round(h) }
      : undefined
  }

  const nodes: DesignGraphNode[] = []
  const annotations: DesignGraphAnnotation[] = []
  const arrows: SceneShape[] = []
  const containers: SceneShape[] = []
  for (const shape of shapes) {
    if (isComponentType(shape.type)) {
      nodes.push({
        id: shape.id,
        componentType: shape.type,
        label: textOf(shape),
        position: positionOf(shape),
        size: sizeOf(shape)
      })
    } else if (shape.type === 'arrow') {
      arrows.push(shape)
    } else if (shape.type === 'group' || shape.type === 'frame') {
      containers.push(shape)
    } else {
      // Text, notes, geo boxes, anything else with text: free annotations. Shapes without any
      // text (freehand strokes, empty boxes) carry nothing the LLM can read and are left out.
      const text = textOf(shape)
      if (text) {
        annotations.push({
          id: shape.id,
          kind: shape.type,
          text,
          position: positionOf(shape),
          nearestNodeId: null
        })
      }
    }
  }
  nodes.sort(byPosition)
  annotations.sort(byPosition)

  const nodeOrder = new Map(nodes.map((node, i) => [node.id, i]))

  // Annotation anchor: its centre when its size is known, else its top-left corner.
  const anchorOf = (annotation: DesignGraphAnnotation) => {
    const measured = pageBounds?.(annotation.id)
    if (measured) return { x: measured.x + measured.w / 2, y: measured.y + measured.h / 2 }
    const shape = allShapes.get(annotation.id)!
    const scale = finite(shape.props['scale']) ?? 1
    const size =
      sizeOf(shape) ??
      (shape.type === 'note' ? { w: NOTE_SIZE * scale, h: NOTE_SIZE * scale } : undefined)
    return {
      x: annotation.position!.x + (size ? size.w / 2 : 0),
      y: annotation.position!.y + (size ? size.h / 2 : 0)
    }
  }
  for (const annotation of annotations) {
    const { x: px, y: py } = anchorOf(annotation)
    let best: { id: string; distance: number } | null = null
    for (const node of nodes) {
      const rect = { ...node.position!, ...(node.size ?? { w: 0, h: 0 }) }
      const distance = distanceToRect(px, py, rect)
      if (distance <= NEAREST_NODE_MAX_DISTANCE && (!best || distance < best.distance)) {
        best = { id: node.id, distance }
      }
    }
    annotation.nearestNodeId = best?.id ?? null
  }

  // One binding per arrow terminal. If a store ever held two, the smallest target id wins.
  const bindings = sceneRecords
    .filter((record) => record.typeName === 'binding')
    .map(toBinding)
    .filter((binding): binding is SceneBinding => binding !== null)
    .sort((a, b) => compareStrings(a.toId, b.toId))
  const endpoint = (arrowId: string, terminal: 'start' | 'end'): string | null => {
    const binding = bindings.find((b) => b.fromId === arrowId && b.terminal === terminal)
    // Bound to an annotation, another arrow or an unknown shape: not a node, so no connection.
    return binding && nodeOrder.has(binding.toId) ? binding.toId : null
  }

  const edges: DesignGraphEdge[] = []
  const danglingArrows: DesignGraphDanglingArrow[] = []
  for (const arrow of arrows) {
    const from = endpoint(arrow.id, 'start')
    const to = endpoint(arrow.id, 'end')
    const label = textOf(arrow)
    if (from !== null && to !== null) {
      edges.push({ id: arrow.id, from, to, label, direction: directionOf(arrow) })
    } else {
      danglingArrows.push({ id: arrow.id, from, to, label })
    }
  }
  const orderOf = (nodeId: string | null) =>
    nodeId === null ? Number.MAX_SAFE_INTEGER : nodeOrder.get(nodeId)!
  edges.sort(
    (a, b) =>
      orderOf(a.from) - orderOf(b.from) ||
      orderOf(a.to) - orderOf(b.to) ||
      compareStrings(a.label, b.label) ||
      compareStrings(a.id, b.id)
  )
  danglingArrows.sort(
    (a, b) =>
      orderOf(a.from) - orderOf(b.from) ||
      orderOf(a.to) - orderOf(b.to) ||
      compareStrings(a.id, b.id)
  )

  const members = [...nodes, ...annotations]
  const groups: Array<DesignGraphGroup & { position: { x: number; y: number } }> = containers.map(
    (container) => ({
      id: container.id,
      kind: container.type === 'frame' ? 'frame' : 'group',
      label: textOf(container),
      memberIds: members
        .filter((member) =>
          ancestry(allShapes.get(member.id)!).ancestors.some(({ id }) => id === container.id)
        )
        .map(({ id }) => id),
      position: positionOf(container)
    })
  )
  groups.sort(byPosition)

  return {
    version: DESIGN_GRAPH_VERSION,
    nodes,
    edges,
    annotations,
    danglingArrows,
    groups: groups.map(({ id, kind, label, memberIds }) => ({ id, kind, label, memberIds }))
  }
}

/** The page a stored snapshot shows: its session's current page, else the first page. */
function snapshotPageId(records: SceneRecord[], currentPageId: unknown): string | null {
  const pages = records
    .filter((record) => record.typeName === 'page')
    .sort(
      (a, b) =>
        compareStrings(String(a['index'] ?? ''), String(b['index'] ?? '')) ||
        compareStrings(a.id, b.id)
    )
  if (pages.some((page) => page.id === currentPageId)) return currentPageId as string
  return pages[0]?.id ?? null
}

function isEditor(source: unknown): source is Editor {
  return isObject(source) && typeof source['getCurrentPageId'] === 'function'
}

/**
 * Design Graph of the current page of a live editor, of a stored editor snapshot
 * (`getSnapshot(editor.store)`, the Design Scene format) or of a store snapshot.
 */
export function exportDesignGraph(
  source: Editor | TLEditorSnapshot | TLStoreSnapshot
): DesignGraph {
  if (isEditor(source)) {
    const editor = source
    return buildDesignGraph(editor.store.allRecords(), editor.getCurrentPageId(), {
      pageBounds: (id) => editor.getShapePageBounds(id as TLShapeId)
    })
  }
  const store: unknown = 'document' in source ? source.document.store : source.store
  const session: unknown = 'session' in source ? source.session : undefined
  const records = Object.values(isObject(store) ? store : {}) as SceneRecord[]
  const currentPageId = isObject(session) ? session['currentPageId'] : undefined
  return buildDesignGraph(records, snapshotPageId(records, currentPageId))
}
