/**
 * Pure scene -> graph conversion. It only reads plain JSON fields of tldraw records
 * (no editor, no DOM), so it runs in node and is unit-testable.
 */

export const COMPONENT_TYPES = ['load-balancer', 'cache', 'database', 'queue'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

/** The subset of a tldraw shape record this exporter relies on. TLShape is assignable to it. */
export interface SceneShape {
  id: string
  type: string
  x: number
  y: number
  parentId?: string
  props: Record<string, any>
}

/** The subset of a tldraw arrow binding record this exporter relies on. */
export interface SceneBinding {
  type: string
  fromId: string
  toId: string
  props: { terminal?: 'start' | 'end' } & Record<string, any>
}

export interface GraphNode {
  id: string
  /** A component type, or `generic` for plain tldraw geo shapes (e.g. "Client"). */
  type: ComponentType | 'generic'
  label: string
  position: { x: number; y: number }
  size: { w: number; h: number }
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label: string
  arrowheadStart: string
  arrowheadEnd: string
}

export interface GraphAnnotation {
  id: string
  kind: 'text' | 'note'
  text: string
  position: { x: number; y: number }
}

/** Arrow with at least one end not attached to a node. Kept so the evaluator can flag it. */
export interface UnconnectedArrow {
  id: string
  label: string
  from: string | null
  to: string | null
}

export interface SceneGraph {
  version: 1
  nodes: GraphNode[]
  edges: GraphEdge[]
  annotations: GraphAnnotation[]
  unconnectedArrows: UnconnectedArrow[]
}

/** Flatten a tldraw rich text value (ProseMirror JSON) into plain text, paragraphs joined by \n. */
export function richTextToPlain(richText: unknown): string {
  const doc = richText as { content?: unknown[] } | undefined
  if (!doc || !Array.isArray(doc.content)) return ''
  const inline = (n: any): string => {
    if (n.type === 'text') return n.text ?? ''
    if (n.type === 'hardBreak') return '\n'
    return Array.isArray(n.content) ? n.content.map(inline).join('') : ''
  }
  return doc.content.map(inline).join('\n').trim()
}

function labelOf(shape: SceneShape): string {
  if (typeof shape.props.text === 'string') return shape.props.text.trim()
  return richTextToPlain(shape.props.richText)
}

function isComponent(type: string): type is ComponentType {
  return (COMPONENT_TYPES as readonly string[]).includes(type)
}

export function buildGraph(shapes: SceneShape[], bindings: SceneBinding[]): SceneGraph {
  const byId = new Map(shapes.map((s) => [s.id, s]))

  // Shapes may sit inside frames/groups: sum offsets up the parent chain (rotation ignored).
  const absolute = (s: SceneShape) => {
    let x = s.x
    let y = s.y
    let parent = s.parentId ? byId.get(s.parentId) : undefined
    while (parent) {
      x += parent.x
      y += parent.y
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return { x: Math.round(x), y: Math.round(y) }
  }

  const nodes: GraphNode[] = []
  const annotations: GraphAnnotation[] = []
  for (const s of shapes) {
    if (isComponent(s.type) || s.type === 'geo') {
      nodes.push({
        id: s.id,
        type: isComponent(s.type) ? s.type : 'generic',
        label: labelOf(s),
        position: absolute(s),
        size: { w: Math.round(s.props.w ?? 0), h: Math.round(s.props.h ?? 0) },
      })
    } else if (s.type === 'text' || s.type === 'note') {
      annotations.push({ id: s.id, kind: s.type, text: labelOf(s), position: absolute(s) })
    }
  }
  const nodeIds = new Set(nodes.map((n) => n.id))

  const endpoint = (arrowId: string, terminal: 'start' | 'end'): string | null => {
    const b = bindings.find(
      (x) => x.type === 'arrow' && x.fromId === arrowId && x.props.terminal === terminal
    )
    return b && nodeIds.has(b.toId) ? b.toId : null
  }

  const edges: GraphEdge[] = []
  const unconnectedArrows: UnconnectedArrow[] = []
  for (const s of shapes) {
    if (s.type !== 'arrow') continue
    const from = endpoint(s.id, 'start')
    const to = endpoint(s.id, 'end')
    const label = labelOf(s)
    if (from && to) {
      edges.push({
        id: s.id,
        from,
        to,
        label,
        arrowheadStart: s.props.arrowheadStart ?? 'none',
        arrowheadEnd: s.props.arrowheadEnd ?? 'arrow',
      })
    } else {
      unconnectedArrows.push({ id: s.id, label, from, to })
    }
  }

  // Deterministic order: top-to-bottom, left-to-right, then id.
  const byPosition = (a: { position: { x: number; y: number }; id: string }, b: typeof a) =>
    a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id)
  nodes.sort(byPosition)
  annotations.sort(byPosition)
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.id.localeCompare(b.id))
  unconnectedArrows.sort((a, b) => a.id.localeCompare(b.id))

  return { version: 1, nodes, edges, annotations, unconnectedArrows }
}
