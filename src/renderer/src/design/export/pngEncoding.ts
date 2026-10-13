/** Size and encoding helpers of the Design Export PNG (`exportDesignPng.tsx`). */

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
