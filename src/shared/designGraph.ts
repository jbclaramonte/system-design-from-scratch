/**
 * Design Graph: the structured export of a Design Scene that the LLM reads to give Design
 * Feedback (issue #13). Built in the renderer from tldraw records
 * (`src/renderer/src/design/export/`), validated here with zod on both sides of the IPC boundary.
 * No tldraw import: the main process uses this file too.
 */

import { z } from 'zod'

/** Component types of the Design Canvas shape catalogue (one tldraw custom shape each). */
export const COMPONENT_TYPES = [
  'client',
  'cdn',
  'load-balancer',
  'service',
  'cache',
  'database',
  'queue'
] as const

export type ComponentType = (typeof COMPONENT_TYPES)[number]

export function isComponentType(type: string): type is ComponentType {
  return (COMPONENT_TYPES as readonly string[]).includes(type)
}

export const DESIGN_GRAPH_VERSION = 1

const id = z.string().min(1).max(200)
const text = z.string().max(10_000)
const point = z.object({ x: z.number(), y: z.number() })
const size = z.object({ w: z.number().nonnegative(), h: z.number().nonnegative() })

/** A component shape of the catalogue. Position and size are page coordinates, rounded. */
export const designGraphNodeSchema = z.object({
  id,
  componentType: z.enum(COMPONENT_TYPES),
  label: text,
  position: point.optional(),
  size: size.optional()
})

/**
 * Visual direction of an arrow, from its arrowheads: `forward` points at `to`, `backward` at
 * `from`, `both` at both ends, `none` is a plain line.
 */
export const EDGE_DIRECTIONS = ['forward', 'backward', 'both', 'none'] as const
export type EdgeDirection = (typeof EDGE_DIRECTIONS)[number]

/** An arrow bound to a node at both ends. `from` is the arrow tail, `to` its head. */
export const designGraphEdgeSchema = z.object({
  id,
  from: id,
  to: id,
  label: text,
  direction: z.enum(EDGE_DIRECTIONS)
})

/**
 * Any other shape carrying text (text, note, geo, frame-less label...). `kind` is the tldraw
 * shape type. `nearestNodeId` is the closest node within reach, or `null`.
 */
export const designGraphAnnotationSchema = z.object({
  id,
  kind: z.string().min(1).max(100),
  text,
  position: point.optional(),
  nearestNodeId: id.nullable()
})

/**
 * An arrow not bound to a node at one end or both (unbound, or bound to an annotation, another
 * arrow or an unknown shape). `from` / `to` are node ids, or `null` for the end without a node.
 */
export const designGraphDanglingArrowSchema = z.object({
  id,
  from: id.nullable(),
  to: id.nullable(),
  label: text
})

/** A tldraw frame or group, with the nodes and annotations it contains (at any depth). */
export const designGraphGroupSchema = z.object({
  id,
  kind: z.enum(['frame', 'group']),
  label: text,
  memberIds: z.array(id)
})

export const designGraphSchema = z
  .object({
    version: z.literal(DESIGN_GRAPH_VERSION),
    nodes: z.array(designGraphNodeSchema).max(2_000),
    edges: z.array(designGraphEdgeSchema).max(5_000),
    annotations: z.array(designGraphAnnotationSchema).max(2_000),
    danglingArrows: z.array(designGraphDanglingArrowSchema).max(5_000),
    groups: z.array(designGraphGroupSchema).max(1_000)
  })
  .superRefine((graph, ctx) => {
    const nodeIds = new Set(graph.nodes.map((node) => node.id))
    const memberIds = new Set([...nodeIds, ...graph.annotations.map((a) => a.id)])
    const ids = [
      ...graph.nodes,
      ...graph.edges,
      ...graph.annotations,
      ...graph.danglingArrows,
      ...graph.groups
    ].map((item) => item.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Design Graph ids must be unique' })
    }
    const checkNode = (value: string | null, path: (string | number)[]) => {
      if (value !== null && !nodeIds.has(value)) {
        ctx.addIssue({ code: 'custom', message: `Unknown node id: ${value}`, path })
      }
    }
    graph.edges.forEach((edge, i) => {
      checkNode(edge.from, ['edges', i, 'from'])
      checkNode(edge.to, ['edges', i, 'to'])
    })
    graph.danglingArrows.forEach((arrow, i) => {
      checkNode(arrow.from, ['danglingArrows', i, 'from'])
      checkNode(arrow.to, ['danglingArrows', i, 'to'])
      if (arrow.from !== null && arrow.to !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'A dangling arrow has at least one end without a node',
          path: ['danglingArrows', i]
        })
      }
    })
    graph.annotations.forEach((annotation, i) =>
      checkNode(annotation.nearestNodeId, ['annotations', i, 'nearestNodeId'])
    )
    graph.groups.forEach((group, i) =>
      group.memberIds.forEach((member, j) => {
        if (!memberIds.has(member)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown group member: ${member}`,
            path: ['groups', i, 'memberIds', j]
          })
        }
      })
    )
  })

export type DesignGraphNode = z.infer<typeof designGraphNodeSchema>
export type DesignGraphEdge = z.infer<typeof designGraphEdgeSchema>
export type DesignGraphAnnotation = z.infer<typeof designGraphAnnotationSchema>
export type DesignGraphDanglingArrow = z.infer<typeof designGraphDanglingArrowSchema>
export type DesignGraphGroup = z.infer<typeof designGraphGroupSchema>
export type DesignGraph = z.infer<typeof designGraphSchema>

/** Longest side of the exported PNG, in pixels. See `docs/Design Export.md`. */
export const DESIGN_PNG_MAX_SIDE = 1568

const PNG_BASE64_PREFIX = 'iVBORw0KGgo' // base64 of the PNG signature

/** PNG capture of a Design Scene, base64 encoded (no `data:` prefix). */
export const designPngSchema = z.object({
  base64: z
    .base64()
    .max(20_000_000)
    .refine((value) => value.startsWith(PNG_BASE64_PREFIX), 'Not a PNG image'),
  width: z.number().int().positive().max(DESIGN_PNG_MAX_SIDE),
  height: z.number().int().positive().max(DESIGN_PNG_MAX_SIDE)
})

export type DesignPng = z.infer<typeof designPngSchema>

/**
 * Everything the LLM evaluation (issue #14) gets from one Design Scene: the Design Graph, its
 * text description and the PNG capture (`null` for an empty scene, which has nothing to draw).
 */
export const designExportSchema = z.object({
  designExerciseId: z.number().int().positive(),
  graph: designGraphSchema,
  description: z.string().max(100_000),
  png: designPngSchema.nullable()
})

export type DesignExport = z.infer<typeof designExportSchema>

/** What the main process answers when it receives a Design Export. */
export interface DesignExportSummary {
  nodes: number
  edges: number
  annotations: number
  danglingArrows: number
  groups: number
  /** Decoded PNG size, 0 without a PNG. */
  pngBytes: number
}
