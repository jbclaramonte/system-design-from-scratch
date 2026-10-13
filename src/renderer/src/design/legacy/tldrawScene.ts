import { isComponentType } from '../../../../shared/designGraph'
import { COMPONENT_LOOKS } from '../componentTypes'
import {
  EMPTY_SCENE,
  SCENE_VERSION,
  sceneSchema,
  type Scene,
  type SceneEdge,
  type SceneNode
} from '../flow/scene'

/**
 * Converter for Design Scenes stored by the tldraw canvas (before issue #43).
 *
 * A legacy value is the editor snapshot of tldraw (`getSnapshot(editor.store)`): `{ document:
 * { store, schema }, session }`, as plain JSON. This file reads those records as plain data and
 * imports nothing from `tldraw`, so the package can be removed. It is pure: the caller decides
 * what to do with the result (the Design Canvas opens it and only stores it after the learner's
 * first edit, see docs/Design Canvas Integration.md).
 *
 * Mapping, from the page the snapshot was showing:
 * - catalogue shapes (`client`, `service`...) -> component nodes, label from `props.text`;
 * - `frame` -> group node (name -> label); a shape inside a frame keeps it as its parent, with the
 *   position relative to it. A tldraw `group` (no size, no name) is flattened: its children go to
 *   the nearest frame above it, or to the canvas;
 * - arrows -> edges, from the **binding records** (never from `props.start` / `props.end`, which go
 *   stale), `direction` from the arrowheads, label from the arrow text;
 * - every other shape with text (`note`, `text`, labelled `geo`...) -> note node.
 *
 * What cannot be kept is listed in `warnings`, so the learner is told instead of losing it
 * silently: arrows without a node at both ends (the new canvas has no free-floating arrow), arrows
 * on a frame or on another arrow, shapes without text (freehand strokes, empty boxes).
 */

/** The snapshot has the tldraw shape, but cannot be turned into a scene. */
export class LegacySceneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacySceneError'
  }
}

export interface LegacyConversion {
  scene: Scene
  /** Things of the old scene that the new canvas cannot keep. Empty when nothing was lost. */
  warnings: string[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A value that looks like a tldraw editor snapshot (and not like a scene of the new format). */
export function isLegacyTldrawSnapshot(value: unknown): boolean {
  return (
    isObject(value) &&
    !('version' in value) &&
    isObject(value['document']) &&
    isObject(value['document']['store']) &&
    isObject(value['document']['schema'])
  )
}

// --- Plain records ------------------------------------------------------------------------------

interface LegacyShape {
  id: string
  type: string
  x: number
  y: number
  parentId: string | null
  index: string
  props: Record<string, unknown>
}

interface LegacyBinding {
  fromId: string
  toId: string
  terminal: 'start' | 'end'
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const positive = (value: unknown): number | undefined => {
  const number = finite(value)
  return number !== undefined && number > 0 ? number : undefined
}
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const round2 = (value: number) => Math.round(value * 100) / 100 || 0
const MAX_TEXT = 10_000
const MAX_SIZE = 100_000

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
function textOf(shape: LegacyShape): string {
  const { text, richText, name } = shape.props
  const plain =
    typeof text === 'string'
      ? text.trim()
      : richText !== undefined
        ? richTextToPlain(richText)
        : typeof name === 'string'
          ? name.trim()
          : ''
  return plain.slice(0, MAX_TEXT)
}

function toShape(record: Record<string, unknown>): LegacyShape | null {
  if (typeof record['id'] !== 'string' || typeof record['type'] !== 'string') return null
  return {
    id: record['id'],
    type: record['type'],
    x: finite(record['x']) ?? 0,
    y: finite(record['y']) ?? 0,
    parentId: typeof record['parentId'] === 'string' ? record['parentId'] : null,
    index: typeof record['index'] === 'string' ? record['index'] : '',
    props: isObject(record['props']) ? record['props'] : {}
  }
}

function toBinding(record: Record<string, unknown>): LegacyBinding | null {
  const { fromId, toId, props } = record
  const terminal = isObject(props) ? props['terminal'] : undefined
  if (record['type'] !== 'arrow' || typeof fromId !== 'string' || typeof toId !== 'string') {
    return null
  }
  if (terminal !== 'start' && terminal !== 'end') return null
  return { fromId, toId, terminal }
}

function directionOf(shape: LegacyShape): SceneEdge['data']['direction'] {
  const { arrowheadStart, arrowheadEnd } = shape.props
  // tldraw defaults: no head at the start, an arrow head at the end.
  const start = (arrowheadStart ?? 'none') !== 'none'
  const end = (arrowheadEnd ?? 'arrow') !== 'none'
  if (start && end) return 'both'
  if (end) return 'forward'
  if (start) return 'backward'
  return 'none'
}

// --- Conversion ---------------------------------------------------------------------------------

/** Size of a tldraw note at scale 1 (notes store no `w` / `h`). */
const NOTE_SIDE = 200
const GEO_DEFAULT = { w: 120, h: 60 }
const TEXT_LINE = 22
const VIEWPORT_MARGIN = 48
/** Zoom range of the canvas (`minZoom` / `maxZoom` of FlowCanvas). */
const MIN_ZOOM = 0.1
const MAX_ZOOM = 2

/** The page a snapshot was showing: its session's current page, else the first page. */
function currentPageId(records: Record<string, unknown>[], session: unknown): string | null {
  const pages = records
    .filter((record) => record['typeName'] === 'page' && typeof record['id'] === 'string')
    .sort(
      (a, b) =>
        compareStrings(String(a['index'] ?? ''), String(b['index'] ?? '')) ||
        compareStrings(String(a['id']), String(b['id']))
    )
  const wanted = isObject(session) ? session['currentPageId'] : undefined
  if (pages.some((page) => page['id'] === wanted)) return wanted as string
  return (pages[0]?.['id'] as string | undefined) ?? null
}

/** Camera of `pageId` in the session of a snapshot, when it has a usable one. */
function cameraOf(
  session: unknown,
  pageId: string | null
): { x: number; y: number; z: number } | null {
  const states = isObject(session) ? session['pageStates'] : undefined
  if (!Array.isArray(states)) return null
  const state = states.find((entry) => isObject(entry) && entry['pageId'] === pageId)
  const camera = isObject(state) ? state['camera'] : undefined
  if (!isObject(camera)) return null
  const x = finite(camera['x'])
  const y = finite(camera['y'])
  const z = positive(camera['z'])
  return x === undefined || y === undefined || z === undefined ? null : { x, y, z }
}

/**
 * Scene of a stored tldraw snapshot. Throws `LegacySceneError` when the snapshot cannot be
 * converted (the caller then offers to start over; it never overwrites the stored value itself).
 */
export function convertTldrawSnapshot(snapshot: unknown): LegacyConversion {
  if (!isLegacyTldrawSnapshot(snapshot)) {
    throw new LegacySceneError('The stored value is not a tldraw snapshot')
  }
  const root = snapshot as { document: { store: Record<string, unknown> }; session?: unknown }
  const records = Object.values(root.document.store).filter(isObject)

  const allShapes = new Map<string, LegacyShape>()
  for (const record of records) {
    const shape = record['typeName'] === 'shape' ? toShape(record) : null
    if (shape) allShapes.set(shape.id, shape)
  }

  const pageId = currentPageId(records, root.session)

  /** Ancestors, innermost first, and the id the chain ends on (the page). Bounded. */
  const ancestry = (shape: LegacyShape) => {
    const ancestors: LegacyShape[] = []
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
    .sort((a, b) => compareStrings(a.index, b.index) || compareStrings(a.id, b.id))

  /**
   * Where a shape sits in the new scene: its nearest frame above it (tldraw groups are skipped,
   * their offsets are added), and its position relative to that frame (or to the canvas).
   */
  const placement = (shape: LegacyShape) => {
    let x = shape.x
    let y = shape.y
    let frameId: string | undefined
    for (const ancestor of ancestry(shape).ancestors) {
      if (ancestor.type === 'frame') {
        frameId = ancestor.id
        break
      }
      x += ancestor.x
      y += ancestor.y
    }
    return { x: round2(x), y: round2(y), frameId }
  }
  /** Depth in frames, to write a frame before the shapes inside it. */
  const frameDepth = (shape: LegacyShape) =>
    ancestry(shape).ancestors.filter((a) => a.type === 'frame').length

  const warnings: string[] = []
  const nodes: Array<{ node: SceneNode; depth: number }> = []
  let withoutText = 0

  for (const shape of shapes) {
    if (shape.type === 'arrow') continue
    // A tldraw group is only a grouping: its children are kept, placed through `placement`.
    if (shape.type === 'group') continue
    const at = placement(shape)
    const base = {
      id: shape.id,
      position: { x: at.x, y: at.y },
      ...(at.frameId ? { parentId: at.frameId } : {})
    }
    const scale = positive(shape.props['scale']) ?? 1
    const size = (w: number | undefined, h: number | undefined, fallback: [number, number]) => ({
      width: Math.min(MAX_SIZE, round2((w ?? fallback[0]) * scale) || fallback[0]),
      height: Math.min(MAX_SIZE, round2((h ?? fallback[1]) * scale) || fallback[1])
    })
    const depth = frameDepth(shape)

    if (isComponentType(shape.type)) {
      const look = COMPONENT_LOOKS[shape.type]
      nodes.push({
        depth,
        node: {
          ...base,
          ...size(positive(shape.props['w']), positive(shape.props['h']), [
            look.defaultW,
            look.defaultH
          ]),
          type: 'component',
          data: { componentType: shape.type, label: textOf(shape) }
        }
      })
    } else if (shape.type === 'frame') {
      nodes.push({
        depth,
        node: {
          ...base,
          ...size(positive(shape.props['w']), positive(shape.props['h']), [600, 400]),
          type: 'group',
          data: { label: textOf(shape) }
        }
      })
    } else {
      const text = textOf(shape)
      if (!text) {
        withoutText++
        continue
      }
      // tldraw text and notes carry no (reliable) height: estimate it from the lines.
      const lines = text.split('\n').length
      const fallback: [number, number] =
        shape.type === 'note'
          ? [NOTE_SIDE, NOTE_SIDE]
          : shape.type === 'geo'
            ? [GEO_DEFAULT.w, GEO_DEFAULT.h]
            : [NOTE_SIDE, lines * TEXT_LINE + 24]
      const boxed = shape.type === 'geo' || shape.type === 'text'
      nodes.push({
        depth,
        node: {
          ...base,
          ...size(
            boxed ? positive(shape.props['w']) : undefined,
            shape.type === 'geo' ? positive(shape.props['h']) : undefined,
            fallback
          ),
          type: 'note',
          data: { text }
        }
      })
    }
  }

  if (withoutText > 0) {
    warnings.push(
      `${withoutText} shape${withoutText === 1 ? '' : 's'} without text (freehand strokes, empty boxes) ${withoutText === 1 ? 'was' : 'were'} not kept.`
    )
  }

  // Frames first (parents before children), then the z-order of tldraw.
  const sceneNodes = nodes
    .map((entry, order) => ({ ...entry, order }))
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        (a.node.type === 'group' ? 0 : 1) - (b.node.type === 'group' ? 0 : 1) ||
        a.order - b.order
    )
    .map(({ node }) => node)
  const byId = new Map(sceneNodes.map((node) => [node.id, node]))

  const absolute = (node: SceneNode) => {
    let { x, y } = node.position
    for (
      let parent = node.parentId ? byId.get(node.parentId) : undefined, hops = 0;
      parent && hops <= byId.size;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined, hops++
    ) {
      x += parent.position.x
      y += parent.position.y
    }
    return { x, y }
  }
  const centerOf = (node: SceneNode) => {
    const at = absolute(node)
    return { x: at.x + node.width / 2, y: at.y + node.height / 2 }
  }

  // One binding per arrow terminal. If a store ever held two, the smallest target id wins.
  const bindings = records
    .filter((record) => record['typeName'] === 'binding')
    .map(toBinding)
    .filter((binding): binding is LegacyBinding => binding !== null)
    .sort((a, b) => compareStrings(a.toId, b.toId))
  const endpoint = (arrowId: string, terminal: 'start' | 'end') =>
    bindings.find((b) => b.fromId === arrowId && b.terminal === terminal)?.toId

  const edges: SceneEdge[] = []
  const lostArrows: string[] = []
  for (const shape of shapes) {
    if (shape.type !== 'arrow') continue
    const source = endpoint(shape.id, 'start')
    const target = endpoint(shape.id, 'end')
    const from = source === undefined ? undefined : byId.get(source)
    const to = target === undefined ? undefined : byId.get(target)
    if (!from || !to || from.type === 'group' || to.type === 'group') {
      lostArrows.push(textOf(shape))
      continue
    }
    // The old arrows attached anywhere on the outline; the new ones leave from one of the four
    // handles. Pick the sides that face each other.
    const a = centerOf(from)
    const b = centerOf(to)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const [sourceHandle, targetHandle] =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? (['right', 'left'] as const)
          : (['left', 'right'] as const)
        : dy >= 0
          ? (['bottom', 'top'] as const)
          : (['top', 'bottom'] as const)
    edges.push({
      id: shape.id,
      source: from.id,
      target: to.id,
      sourceHandle,
      targetHandle,
      data: { label: textOf(shape), direction: directionOf(shape) }
    })
  }
  if (lostArrows.length > 0) {
    const n = lostArrows.length
    warnings.push(
      `${n} arrow${n === 1 ? '' : 's'} not attached to a component or a note at both ends ${n === 1 ? 'was' : 'were'} not kept.`
    )
  }

  // The view the learner left: tldraw's camera of the page (screen = (page + camera) * zoom) is
  // React Flow's viewport (screen = flow * zoom + translation). Without a camera, frame the
  // content: its top left corner sits at a fixed margin.
  let viewport = EMPTY_SCENE.viewport
  const camera = cameraOf(root.session, pageId)
  if (camera) {
    viewport = {
      x: round2(camera.x * camera.z),
      y: round2(camera.y * camera.z),
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.z))
    }
  } else if (sceneNodes.length > 0) {
    const minX = Math.min(...sceneNodes.map((node) => absolute(node).x))
    const minY = Math.min(...sceneNodes.map((node) => absolute(node).y))
    viewport = { x: round2(VIEWPORT_MARGIN - minX), y: round2(VIEWPORT_MARGIN - minY), zoom: 1 }
  }

  const parsed = sceneSchema.safeParse({
    version: SCENE_VERSION,
    nodes: sceneNodes,
    edges,
    viewport
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new LegacySceneError(
      `The converted scene is not valid (${issue?.path.join('.') || '(root)'}: ${issue?.message})`
    )
  }
  return { scene: parsed.data, warnings }
}
