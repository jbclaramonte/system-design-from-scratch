import { describe, expect, it } from 'vitest'
import { DESIGN_PNG_MAX_SIDE } from '../../../../shared/designGraph'
import { fitWithin } from './pngEncoding'
import { pngLayout, sceneBounds } from './pngLayout'
import { architectureScene, component, group, scene } from '../flow/sceneFixtures'

describe('PNG layout', () => {
  it('has no bounds for an empty scene', () => {
    expect(sceneBounds([])).toBeNull()
  })

  it('frames every node, with the group offsets applied', () => {
    expect(sceneBounds(architectureScene().nodes)).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 490
    })
    const nested = scene([group('g', 100, 100, 'G'), component('a', 'cache', 600, 50, 'A', 'g')])
    // The component sits at (700, 150) on the canvas and ends at x = 860: the group ends at 580.
    expect(sceneBounds(nested.nodes)).toEqual({ x: 100, y: 100, width: 760, height: 320 })
  })

  it('renders a small scene at 2x with a fixed padding', () => {
    const layout = pngLayout({ x: 100, y: 50, width: 300, height: 200 })
    expect(layout).toMatchObject({ width: 364, height: 264, translateX: -68, translateY: -18 })
    expect(layout.pixelRatio).toBe(2)
  })

  it('keeps the longest side within the limit whatever the scene size', () => {
    for (const [width, height] of [
      [2000, 300],
      [300, 5000],
      [1500, 1500],
      [784, 100],
      [20, 20]
    ] as const) {
      const layout = pngLayout({ x: 0, y: 0, width, height })
      const out = fitWithin(
        layout.width * layout.pixelRatio,
        layout.height * layout.pixelRatio,
        DESIGN_PNG_MAX_SIDE
      )
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(DESIGN_PNG_MAX_SIDE)
    }
    const big = pngLayout({ x: 0, y: 0, width: 4000, height: 1000 })
    expect(big.pixelRatio).toBeLessThan(0.4)
  })
})
