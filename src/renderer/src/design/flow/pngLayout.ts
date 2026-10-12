import { DESIGN_PNG_MAX_SIDE } from '../../../../shared/designGraph'
import { absolutePositionIn } from './geometry'
import type { SceneNode } from './scene'

/** Pure layout of the PNG export (spike #42): what to frame and at which pixel ratio. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of every node on the canvas (group offsets applied), or `null` without nodes. */
export function sceneBounds(nodes: readonly SceneNode[]): Rect | null {
  if (nodes.length === 0) return null
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const { x, y } = absolutePositionIn(node, byId)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + node.width)
    maxY = Math.max(maxY, y + node.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export const PNG_PADDING = 32
export const PNG_MAX_PIXEL_RATIO = 2

export interface PngLayout {
  /** Size of the frame to capture, in canvas units (zoom 1), padding included. */
  width: number
  height: number
  /** Viewport translation that puts the content in the frame. */
  translateX: number
  translateY: number
  /** Device pixels per canvas unit: 2 for a small scene (sharp text), less for a big one. */
  pixelRatio: number
}

/** Fixed padding, so the same scene always gives the same framing. */
export function pngLayout(
  bounds: Rect,
  maxSide: number = DESIGN_PNG_MAX_SIDE,
  padding = PNG_PADDING
): PngLayout {
  const width = Math.ceil(bounds.width + 2 * padding)
  const height = Math.ceil(bounds.height + 2 * padding)
  return {
    width,
    height,
    translateX: padding - bounds.x,
    translateY: padding - bounds.y,
    pixelRatio: Math.min(PNG_MAX_PIXEL_RATIO, maxSide / Math.max(width, height))
  }
}
