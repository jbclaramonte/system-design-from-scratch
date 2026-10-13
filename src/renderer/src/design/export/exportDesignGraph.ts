import {
  DESIGN_GRAPH_VERSION,
  designGraphSchema,
  type DesignGraph,
  type DesignGraphAnnotation,
  type DesignGraphDanglingArrow,
  type DesignGraphEdge,
  type DesignGraphGroup,
  type DesignGraphNode
} from '../../../../shared/designGraph'
import type { Scene, SceneGroupNode, SceneNode } from '../flow/scene'

/**
 * Design Scene of the React Flow canvas to Design Graph. The scene already is a typed graph (the
 * nodes and edges of the canvas), so this is a mapping, not a reconstruction. Pure (no React, no
 * DOM, no React Flow import). The same scene gives the same graph in any array order, and
 * `describeDesignGraph` reads it unchanged.
 *
 * - component nodes -> `nodes`; notes with text -> `annotations` (kind `note`);
 * - edges between two components -> `edges`; any other edge (an end on a note, or on a node that
 *   is not in the scene) -> `danglingArrows`, the end without a component being `null`;
 * - group nodes -> `groups` (kind `frame`) with every component and annotation inside, at any depth.
 */

/** A note further than this (canvas units) from every component has no nearest component. */
export const NEAREST_NODE_MAX_DISTANCE = 200

const round = (value: number) => Math.round(value) || 0
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

type Rect = { x: number; y: number; w: number; h: number }

const byPosition = (
  a: { id: string; position?: { x: number; y: number } },
  b: { id: string; position?: { x: number; y: number } }
) =>
  (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
  (a.position?.x ?? 0) - (b.position?.x ?? 0) ||
  compareStrings(a.id, b.id)

function distanceToRect(px: number, py: number, rect: Rect): number {
  const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.w))
  const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.h))
  return Math.hypot(dx, dy)
}

/**
 * Design Graph of a scene: the stored scene, or the nodes and edges of the live canvas
 * (`FlowCanvasHandle.getScene()`). Throws if the result breaks the shared schema.
 */
export function exportDesignGraph(scene: Pick<Scene, 'nodes' | 'edges'>): DesignGraph {
  const byId = new Map<string, SceneNode>(scene.nodes.map((node) => [node.id, node]))

  /** Ancestors, innermost first. Bounded, so a corrupt parent loop cannot hang the export. */
  const ancestorsOf = (node: SceneNode): SceneNode[] => {
    const ancestors: SceneNode[] = []
    let parent = node.parentId ? byId.get(node.parentId) : undefined
    while (parent && ancestors.length < byId.size) {
      ancestors.push(parent)
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return ancestors
  }
  const absolute = (node: SceneNode) => {
    let { x, y } = node.position
    for (const ancestor of ancestorsOf(node)) {
      x += ancestor.position.x
      y += ancestor.position.y
    }
    return { x, y }
  }
  const rectOf = (node: SceneNode): Rect => {
    const { x, y } = absolute(node)
    return { x, y, w: node.width, h: node.height }
  }

  const nodes: DesignGraphNode[] = []
  const annotations: DesignGraphAnnotation[] = []
  const groupNodes: SceneGroupNode[] = []
  const sorted = [...scene.nodes].sort((a, b) => compareStrings(a.id, b.id))
  for (const node of sorted) {
    const at = absolute(node)
    const position = { x: round(at.x), y: round(at.y) }
    if (node.type === 'component') {
      nodes.push({
        id: node.id,
        componentType: node.data.componentType,
        label: node.data.label.trim(),
        position,
        size: { w: round(node.width), h: round(node.height) }
      })
    } else if (node.type === 'note') {
      // A note without text carries nothing the LLM can read, like an empty note.
      const text = node.data.text.trim()
      if (text) annotations.push({ id: node.id, kind: 'note', text, position, nearestNodeId: null })
    } else {
      groupNodes.push(node)
    }
  }
  nodes.sort(byPosition)
  annotations.sort(byPosition)

  const nodeOrder = new Map(nodes.map((node, i) => [node.id, i]))

  // Nearest component to the center of each note, within reach.
  for (const annotation of annotations) {
    const rect = rectOf(byId.get(annotation.id)!)
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    let best: { id: string; distance: number } | null = null
    for (const node of nodes) {
      const distance = distanceToRect(cx, cy, rectOf(byId.get(node.id)!))
      if (distance <= NEAREST_NODE_MAX_DISTANCE && (!best || distance < best.distance)) {
        best = { id: node.id, distance }
      }
    }
    annotation.nearestNodeId = best?.id ?? null
  }

  const edges: DesignGraphEdge[] = []
  const danglingArrows: DesignGraphDanglingArrow[] = []
  for (const edge of scene.edges) {
    const from = nodeOrder.has(edge.source) ? edge.source : null
    const to = nodeOrder.has(edge.target) ? edge.target : null
    const label = edge.data.label.trim()
    if (from !== null && to !== null) {
      edges.push({ id: edge.id, from, to, label, direction: edge.data.direction })
    } else {
      danglingArrows.push({ id: edge.id, from, to, label })
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
  const groups = groupNodes.map((group) => ({
    id: group.id,
    kind: 'frame' as const,
    label: group.data.label.trim(),
    memberIds: members
      .filter((member) =>
        ancestorsOf(byId.get(member.id)!).some((ancestor) => ancestor.id === group.id)
      )
      .map(({ id }) => id),
    position: absolute(group)
  }))
  groups.sort(byPosition)

  const graph: DesignGraph = {
    version: DESIGN_GRAPH_VERSION,
    nodes,
    edges,
    annotations,
    danglingArrows,
    groups: groups.map(({ id, kind, label, memberIds }): DesignGraphGroup => ({
      id,
      kind,
      label,
      memberIds
    }))
  }
  // The contract is the shared schema: fail here, not in the main process, if the mapping drifts.
  return designGraphSchema.parse(graph)
}
