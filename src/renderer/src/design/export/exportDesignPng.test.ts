import { describe, expect, it } from 'vitest'
import { bytesToBase64, fitWithin } from './exportDesignPng'

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
