import type { Editor } from 'tldraw'
import { DESIGN_PNG_MAX_SIDE, type DesignPng } from '../../../../shared/designGraph'

/**
 * PNG capture of the current page of the Design Canvas, for the LLM evaluation.
 *
 * - Light mode on an opaque white background, whatever the editor theme: the LLM sees dark
 *   strokes on white, and transparent pixels never turn black in a viewer.
 * - Longest side at most `DESIGN_PNG_MAX_SIDE` (1568 px): Claude downscales larger images
 *   anyway, so bigger only costs bytes and tokens. Small scenes render at 2x for sharp text.
 * - Fixed 32 px padding, so the same scene gives the same framing.
 */

const PADDING = 32
const MAX_PIXEL_RATIO = 2

export interface DesignPngOptions {
  /** Longest side of the image in pixels. Default and upper bound: `DESIGN_PNG_MAX_SIDE`. */
  maxSide?: number
}

/** Size that fits `width` x `height` within `maxSide`, keeping the aspect ratio (never 0). */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

/** Base64 of raw bytes (no `data:` prefix), in chunks to stay under the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** PNG of every shape of the current page, or `null` when the page is empty. */
export async function exportDesignPng(
  editor: Editor,
  options: DesignPngOptions = {}
): Promise<DesignPng | null> {
  const maxSide = Math.min(options.maxSide ?? DESIGN_PNG_MAX_SIDE, DESIGN_PNG_MAX_SIDE)
  const ids = [...editor.getCurrentPageShapeIds()]
  const bounds = editor.getCurrentPageBounds()
  if (ids.length === 0 || !bounds) return null

  // Render close to the target size: sharp for small scenes, no huge canvas for big ones.
  const contentSide = Math.max(bounds.w, bounds.h) + 2 * PADDING
  const pixelRatio = Math.min(MAX_PIXEL_RATIO, maxSide / contentSide)
  const { blob } = await editor.toImage(ids, {
    format: 'png',
    background: false,
    darkMode: false,
    padding: PADDING,
    pixelRatio
  })

  // Flatten on white and clamp to maxSide (arrowheads or labels may overflow the bounds).
  const bitmap = await createImageBitmap(blob)
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide)
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a 2D canvas for the PNG export')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const png = await canvas.convertToBlob({ type: 'image/png' })
  return { base64: bytesToBase64(new Uint8Array(await png.arrayBuffer())), width, height }
}
