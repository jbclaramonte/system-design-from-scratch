import type { Editor } from 'tldraw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64, exportDesignPng, fitWithin } from './exportDesignPng'

describe('fitWithin', () => {
  it('keeps an image that already fits', () => {
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600 })
  })

  it('scales the longest side down to the maximum, keeping the aspect ratio', () => {
    expect(fitWithin(3136, 1000, 1568)).toEqual({ width: 1568, height: 500 })
    expect(fitWithin(500, 4704, 1568)).toEqual({ width: 167, height: 1568 })
  })

  it('never returns a zero side', () => {
    expect(fitWithin(10_000, 1, 1568)).toEqual({ width: 1568, height: 1 })
  })
})

describe('bytesToBase64', () => {
  it('matches Node base64, including inputs larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 31) % 256)

    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    expect(bytesToBase64(new Uint8Array())).toBe('')
  })
})

describe('exportDesignPng on the dark Design Canvas', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks tldraw for light mode, then flattens the capture on opaque white', async () => {
    const toImage = vi.fn().mockResolvedValue({ blob: new Blob(['png']) })
    const editor = {
      getCurrentPageShapeIds: () => new Set(['shape:a']),
      getCurrentPageBounds: () => ({ w: 400, h: 300 }),
      toImage
    } as unknown as Editor

    const operations: string[] = []
    const context = {
      set fillStyle(value: string) {
        operations.push(`fillStyle=${value}`)
      },
      fillRect: (...args: number[]) => operations.push(`fillRect(${args.join(',')})`),
      drawImage: () => operations.push('drawImage')
    }
    vi.stubGlobal('createImageBitmap', async () => ({ width: 464, height: 364, close: () => {} }))
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext = () => context
        convertToBlob = async () => new Blob([Uint8Array.of(1, 2, 3)], { type: 'image/png' })
      }
    )

    const png = await exportDesignPng(editor)

    expect(toImage.mock.calls[0]![1]).toMatchObject({
      format: 'png',
      darkMode: false,
      background: false
    })
    // White is painted first, the transparent capture is drawn over it.
    expect(operations).toEqual(['fillStyle=#ffffff', 'fillRect(0,0,464,364)', 'drawImage'])
    expect(png).toMatchObject({ width: 464, height: 364, base64: 'AQID' })
  })

  it('exports nothing for an empty page', async () => {
    const editor = {
      getCurrentPageShapeIds: () => new Set(),
      getCurrentPageBounds: () => undefined
    } as unknown as Editor

    expect(await exportDesignPng(editor)).toBeNull()
  })
})
