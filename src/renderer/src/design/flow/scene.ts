/**
 * Design Scene format of the React Flow canvas (spike #42): what goes into
 * `design_scenes.snapshot`. Plain JSON, validated with zod on every read, no React Flow import:
 * the editor state (selection, measured sizes, drag flags, arrow markers) is derived, never stored.
 *
 * Coordinates follow React Flow: a node with a `parentId` is positioned relative to its group.
 * Array order is the drawing order (a group comes before the nodes it contains).
 */

import { z } from 'zod'
import { COMPONENT_TYPES, EDGE_DIRECTIONS } from '../../../../shared/designGraph'
import type { Json } from '../../../../shared/json'

export const SCENE_VERSION = 1

const id = z.string().min(1).max(200)
const text = z.string().max(10_000)
const coordinate = z.number().finite()
const length = z.number().finite().positive().max(100_000)
const position = z.object({ x: coordinate, y: coordinate })

const nodeBase = {
  id,
  position,
  width: length,
  height: length,
  /** Id of the group node this node sits in. */
  parentId: id.optional()
}

/** A typed component of the catalogue (one custom node, one `componentType`). */
export const sceneComponentNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('component'),
  data: z.object({ componentType: z.enum(COMPONENT_TYPES), label: text })
})

/** A free text note. */
export const sceneNoteNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('note'),
  data: z.object({ text })
})

/** A frame that contains other nodes. */
export const sceneGroupNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('group'),
  data: z.object({ label: text })
})

export const sceneNodeSchema = z.discriminatedUnion('type', [
  sceneComponentNodeSchema,
  sceneNoteNodeSchema,
  sceneGroupNodeSchema
])

/**
 * A connection. `source` is the tail and `target` the head, as `from` and `to` in the Design
 * Graph. `direction` says which ends carry an arrowhead (same values as the Design Graph).
 */
export const sceneEdgeSchema = z.object({
  id,
  source: id,
  target: id,
  sourceHandle: z.string().max(50).optional(),
  targetHandle: z.string().max(50).optional(),
  data: z.object({ label: text, direction: z.enum(EDGE_DIRECTIONS) })
})

export const sceneViewportSchema = z.object({ x: coordinate, y: coordinate, zoom: length })

export const sceneSchema = z
  .object({
    version: z.literal(SCENE_VERSION),
    nodes: z.array(sceneNodeSchema).max(2_000),
    edges: z.array(sceneEdgeSchema).max(5_000),
    viewport: sceneViewportSchema
  })
  .superRefine((scene, ctx) => {
    const byId = new Map(scene.nodes.map((node) => [node.id, node]))
    const ids = [...scene.nodes, ...scene.edges].map((item) => item.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Ids must be unique across nodes and edges' })
    }
    scene.nodes.forEach((node, i) => {
      if (node.parentId === undefined) return
      const parent = byId.get(node.parentId)
      if (!parent || parent.type !== 'group') {
        ctx.addIssue({
          code: 'custom',
          message: `Parent ${node.parentId} is not a group of the scene`,
          path: ['nodes', i, 'parentId']
        })
        return
      }
      // Walk up: a chain longer than the node count is a cycle.
      let current: SceneNode = parent
      for (let hops = 0; current.parentId !== undefined; hops++) {
        const next = byId.get(current.parentId)
        if (!next || hops > scene.nodes.length) {
          ctx.addIssue({
            code: 'custom',
            message: `Group nesting of ${node.id} loops or is broken`,
            path: ['nodes', i, 'parentId']
          })
          return
        }
        current = next
      }
    })
    scene.edges.forEach((edge, i) => {
      for (const end of ['source', 'target'] as const) {
        const node = byId.get(edge[end])
        if (!node || node.type === 'group') {
          ctx.addIssue({
            code: 'custom',
            message: `Edge ${end} ${edge[end]} is not a component or note of the scene`,
            path: ['edges', i, end]
          })
        }
      }
    })
  })

export type SceneNode = z.infer<typeof sceneNodeSchema>
export type SceneComponentNode = z.infer<typeof sceneComponentNodeSchema>
export type SceneNoteNode = z.infer<typeof sceneNoteNodeSchema>
export type SceneGroupNode = z.infer<typeof sceneGroupNodeSchema>
export type SceneEdge = z.infer<typeof sceneEdgeSchema>
export type SceneViewport = z.infer<typeof sceneViewportSchema>
export type Scene = z.infer<typeof sceneSchema>

export const EMPTY_SCENE: Scene = {
  version: SCENE_VERSION,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 }
}

/** The stored value of a Design Scene is not a valid scene. */
export class InvalidSceneError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSceneError'
  }
}

/** Plain JSON copy of a valid scene, safe to send over IPC and store. Throws if it is invalid. */
export function serializeScene(scene: Scene): Json {
  const parsed = sceneSchema.safeParse(scene)
  if (!parsed.success) {
    throw new InvalidSceneError(
      `Refusing to store an invalid Design Scene: ${describeIssues(parsed.error)}`
    )
  }
  return JSON.parse(JSON.stringify(parsed.data)) as Json
}

/**
 * Scene to restore from a stored value, or `undefined` when there is none yet (`null`). Throws an
 * `InvalidSceneError` on any other value that is not a valid scene, so the caller shows an error
 * instead of opening (and then autosaving over) an empty canvas.
 */
export function deserializeScene(stored: Json | null): Scene | undefined {
  if (stored === null) return undefined
  const parsed = sceneSchema.safeParse(stored)
  if (!parsed.success) {
    throw new InvalidSceneError(`Stored Design Scene is not valid: ${describeIssues(parsed.error)}`)
  }
  return parsed.data
}

/** Same as `deserializeScene` for the JSON text of a storage (localStorage, a file). */
export function parseSceneText(raw: string): Scene {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new InvalidSceneError('Stored Design Scene is not valid JSON')
  }
  const scene = deserializeScene(value as Json)
  if (!scene) throw new InvalidSceneError('Stored Design Scene is empty')
  return scene
}

function describeIssues(error: z.ZodError): string {
  const shown = error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
  const more = error.issues.length > 3 ? ` (+${error.issues.length - 3} more)` : ''
  return shown.join('; ') + more
}
