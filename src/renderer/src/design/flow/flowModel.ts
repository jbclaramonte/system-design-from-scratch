import { MarkerType, type Edge, type Node, type Viewport } from '@xyflow/react'
import type { ComponentType, EdgeDirection } from '../../../../shared/designGraph'
import { COMPONENT_LOOKS } from '../componentTypes'
import { absolutePositionIn } from './geometry'
import { FLOW_PALETTES, type FlowMode } from './flowTheme'
import {
  SCENE_VERSION,
  type Scene,
  type SceneEdge,
  type SceneNode,
  type SceneViewport
} from './scene'

/**
 * Editor model of the React Flow canvas: the React Flow nodes and edges, and the pure
 * functions around them (scene conversion, group membership, copy and paste). No DOM and no React,
 * so every function runs in unit tests.
 */

export type ComponentNodeData = { componentType: ComponentType; label: string }
export type NoteNodeData = { text: string }
export type GroupNodeData = { label: string }

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>
export type NoteFlowNode = Node<NoteNodeData, 'note'>
export type GroupFlowNode = Node<GroupNodeData, 'group'>
export type FlowNode = ComponentFlowNode | NoteFlowNode | GroupFlowNode

export type LinkEdgeData = { label: string; direction: EdgeDirection }
export type FlowEdge = Edge<LinkEdgeData, 'link'>

/** Only the title bar drags a group (`dragHandle`): the body stays free for a box selection. */
export const GROUP_DRAG_HANDLE = '.flow-group-title'

export const NOTE_SIZE = { width: 200, height: 120 }
export const GROUP_SIZE = { width: 480, height: 320 }
/** Grid of the snap-to-grid option, also the offset of a pasted copy. */
export const GRID = 16

const round2 = (value: number) => Math.round(value * 100) / 100 || 0

// --- Creation -------------------------------------------------------------------------------

export function createComponentNode(
  id: string,
  componentType: ComponentType,
  position: { x: number; y: number }
): ComponentFlowNode {
  const { label, defaultW, defaultH } = COMPONENT_LOOKS[componentType]
  return {
    id,
    type: 'component',
    position,
    width: defaultW,
    height: defaultH,
    data: { componentType, label }
  }
}

export function createNoteNode(id: string, position: { x: number; y: number }): NoteFlowNode {
  return { id, type: 'note', position, ...NOTE_SIZE, data: { text: '' } }
}

export function createGroupNode(id: string, position: { x: number; y: number }): GroupFlowNode {
  return {
    id,
    type: 'group',
    position,
    ...GROUP_SIZE,
    dragHandle: GROUP_DRAG_HANDLE,
    data: { label: '' }
  }
}

// --- Edges: direction and arrowheads ----------------------------------------------------------

/** Arrowheads of an edge, derived from its direction and the color of the mode. */
export function edgeMarkers(
  direction: EdgeDirection,
  mode: FlowMode
): Pick<FlowEdge, 'markerStart' | 'markerEnd'> {
  const marker = {
    type: MarkerType.ArrowClosed,
    color: FLOW_PALETTES[mode].edge,
    width: 18,
    height: 18
  }
  return {
    markerStart: direction === 'backward' || direction === 'both' ? marker : undefined,
    markerEnd: direction === 'forward' || direction === 'both' ? marker : undefined
  }
}

export function createEdge(
  id: string,
  connection: {
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
  },
  mode: FlowMode,
  data: LinkEdgeData = { label: '', direction: 'forward' }
): FlowEdge {
  return {
    id,
    type: 'link',
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
    data,
    ...edgeMarkers(data.direction, mode)
  }
}

// --- Scene conversion -------------------------------------------------------------------------

const rank = (node: FlowNode, depth: number) => depth * 2 + (node.type === 'group' ? 0 : 1)

/**
 * Nodes in drawing order: a parent always before its children (React Flow requires it), and
 * groups behind the components of the same level. Stable, so equal ranks keep their order.
 */
export function sortParentsFirst<N extends FlowNode>(nodes: readonly N[]): N[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depthOf = (node: FlowNode): number => {
    let depth = 0
    for (
      let parent = node.parentId ? byId.get(node.parentId) : undefined;
      parent && depth <= nodes.length;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    ) {
      depth++
    }
    return depth
  }
  return nodes
    .map((node, index) => ({ node, index, rank: rank(node, depthOf(node)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ node }) => node)
}

function flowNodeFromScene(node: SceneNode): FlowNode {
  const base = {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    width: node.width,
    height: node.height,
    ...(node.parentId === undefined ? {} : { parentId: node.parentId })
  }
  switch (node.type) {
    case 'component':
      return { ...base, type: 'component', data: { ...node.data } }
    case 'note':
      return { ...base, type: 'note', data: { ...node.data } }
    case 'group':
      return { ...base, type: 'group', dragHandle: GROUP_DRAG_HANDLE, data: { ...node.data } }
  }
}

function flowEdgeFromScene(edge: SceneEdge, mode: FlowMode): FlowEdge {
  return createEdge(edge.id, edge, mode, { ...edge.data })
}

/** Editor state of a stored scene, for a color mode (the arrowheads depend on it). */
export function toFlow(
  scene: Scene,
  mode: FlowMode
): { nodes: FlowNode[]; edges: FlowEdge[]; viewport: Viewport } {
  return {
    nodes: sortParentsFirst(scene.nodes.map(flowNodeFromScene)),
    edges: scene.edges.map((edge) => flowEdgeFromScene(edge, mode)),
    viewport: { ...scene.viewport }
  }
}

function sizeOf(node: FlowNode): { width: number; height: number } {
  const fallback =
    node.type === 'component'
      ? {
          width: COMPONENT_LOOKS[node.data.componentType].defaultW,
          height: COMPONENT_LOOKS[node.data.componentType].defaultH
        }
      : node.type === 'note'
        ? NOTE_SIZE
        : GROUP_SIZE
  return {
    width: round2(node.width ?? node.measured?.width ?? fallback.width),
    height: round2(node.height ?? node.measured?.height ?? fallback.height)
  }
}

function sceneNodeFromFlow(node: FlowNode): SceneNode {
  const base = {
    id: node.id,
    position: { x: round2(node.position.x), y: round2(node.position.y) },
    ...sizeOf(node),
    ...(node.parentId === undefined ? {} : { parentId: node.parentId })
  }
  switch (node.type) {
    case 'component':
      return {
        ...base,
        type: 'component',
        data: { componentType: node.data.componentType, label: node.data.label }
      }
    case 'note':
      return { ...base, type: 'note', data: { text: node.data.text } }
    case 'group':
      return { ...base, type: 'group', data: { label: node.data.label } }
  }
}

/**
 * Stored scene of the editor state. Keeps only the persisted fields: selection, drag flags,
 * measured sizes, handle bounds and arrowheads are left out (the arrowheads come back from
 * `direction`). Nodes keep their order, so the drawing order survives a reload.
 */
export function toScene(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  viewport: Viewport
): Scene {
  const sceneViewport: SceneViewport = {
    x: round2(viewport.x),
    y: round2(viewport.y),
    zoom: viewport.zoom
  }
  return {
    version: SCENE_VERSION,
    nodes: nodes.map(sceneNodeFromFlow),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      data: { label: edge.data?.label ?? '', direction: edge.data?.direction ?? 'forward' }
    })),
    viewport: sceneViewport
  }
}

// --- Groups -----------------------------------------------------------------------------------

/** Position of a node on the canvas (the parent offsets summed up the chain). */
export const absolutePosition = (node: FlowNode, byId: ReadonlyMap<string, FlowNode>) =>
  absolutePositionIn(node, byId)

/**
 * Group membership after a drag: React Flow keeps `parentId` as it is, so this is the code that
 * puts a dropped component or note into the group under its center, or takes it out. Groups
 * themselves never change parent. A node dragged together with its own group is left alone (it
 * moved with it). The smallest group under the center wins (innermost).
 */
export function reparentDropped(
  nodes: readonly FlowNode[],
  droppedIds: ReadonlySet<string>
): FlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const groups = nodes.filter((node) => node.type === 'group')
  const result = nodes.map((node): FlowNode => {
    if (node.type === 'group' || !droppedIds.has(node.id)) return node
    if (node.parentId && droppedIds.has(node.parentId)) return node
    const { width, height } = sizeOf(node)
    const origin = absolutePosition(node, byId)
    const center = { x: origin.x + width / 2, y: origin.y + height / 2 }
    const target = groups
      .filter((group) => {
        const at = absolutePosition(group, byId)
        const size = sizeOf(group)
        return (
          group.id !== node.id &&
          center.x >= at.x &&
          center.x <= at.x + size.width &&
          center.y >= at.y &&
          center.y <= at.y + size.height
        )
      })
      .sort((a, b) => sizeOf(a).width * sizeOf(a).height - sizeOf(b).width * sizeOf(b).height)[0]
    if (target?.id === node.parentId) return node
    const parentAt = target ? absolutePosition(target, byId) : { x: 0, y: 0 }
    return {
      ...omitParent(node),
      position: { x: round2(origin.x - parentAt.x), y: round2(origin.y - parentAt.y) },
      ...(target ? { parentId: target.id } : {})
    } as FlowNode
  })
  return sortParentsFirst(result)
}

// --- Copy and paste ---------------------------------------------------------------------------

/** What Copy keeps: the selected nodes (with the content of selected groups) and the edges between them. */
export interface ClipboardContent {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * Copy of the selection. A selected group brings the nodes inside it. Nodes whose parent is not
 * copied are stored with their canvas position, so the copy does not depend on the old group.
 */
export function copySelection(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[]
): ClipboardContent {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
  const inside = (node: FlowNode): boolean => {
    for (let parent = node.parentId, hops = 0; parent && hops <= nodes.length; hops++) {
      if (selected.has(parent)) return true
      parent = byId.get(parent)?.parentId
    }
    return false
  }
  const copied = new Set(
    nodes.filter((node) => selected.has(node.id) || inside(node)).map((node) => node.id)
  )
  return {
    nodes: nodes
      .filter((node) => copied.has(node.id))
      .map((node) =>
        node.parentId && copied.has(node.parentId)
          ? node
          : ({ ...omitParent(node), position: absolutePosition(node, byId) } as FlowNode)
      ),
    edges: edges.filter((edge) => copied.has(edge.source) && copied.has(edge.target))
  }
}

function omitParent(node: FlowNode): FlowNode {
  const rest = { ...node }
  delete rest.parentId
  return rest
}

/**
 * Copy of the clipboard content with new ids, `GRID * 2` further down and right, selected.
 * Everything else must be deselected by the caller.
 */
export function pasteClipboard(
  content: ClipboardContent,
  newId: () => string,
  mode: FlowMode,
  offset = GRID * 2
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const ids = new Map(content.nodes.map((node) => [node.id, newId()]))
  const nodes = content.nodes.map((node): FlowNode => {
    const parentId = node.parentId ? ids.get(node.parentId) : undefined
    const shifted = parentId
      ? node.position
      : { x: node.position.x + offset, y: node.position.y + offset }
    return {
      ...omitParent(node),
      id: ids.get(node.id)!,
      position: shifted,
      selected: !parentId,
      ...(parentId ? { parentId } : {})
    } as FlowNode
  })
  const edges = content.edges.map((edge) => ({
    ...createEdge(
      newId(),
      {
        source: ids.get(edge.source)!,
        target: ids.get(edge.target)!,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      },
      mode,
      edge.data
    ),
    selected: true
  }))
  return { nodes: sortParentsFirst(nodes), edges }
}
