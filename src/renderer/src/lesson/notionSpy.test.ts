import { describe, expect, it } from 'vitest'
import { activeNotion } from './notionSpy'

const anchors = [
  { slug: 'server', offset: -400 },
  { slug: 'cpu', offset: 80 },
  { slug: 'ram', offset: 500 }
]
const view = { threshold: 150, viewport: 600, atBottom: false }

describe('activeNotion', () => {
  it('is the last notion whose heading scrolled above the threshold', () => {
    expect(activeNotion(anchors, view)).toBe('cpu')
  })

  it('is null before the first notion', () => {
    expect(activeNotion([{ slug: 'server', offset: 300 }], view)).toBeNull()
    expect(activeNotion([], view)).toBeNull()
  })

  it('reaches the last visible notion once scrolled to the bottom', () => {
    expect(activeNotion(anchors, { ...view, atBottom: true })).toBe('ram')
  })
})
