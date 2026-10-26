import { describe, expect, it } from 'vitest'
import { RECALL_WINDOW, classifyNotion } from './memory'

describe('classifyNotion', () => {
  it('has a window of 6 answers', () => {
    expect(RECALL_WINDOW).toBe(6)
  })

  it('leaves a notion with fewer than 2 answers untracked', () => {
    expect(classifyNotion([])).toBe('untracked')
    expect(classifyNotion([true])).toBe('untracked')
    expect(classifyNotion([false])).toBe('untracked')
  })

  it('is solid when every answer of a short history is correct', () => {
    expect(classifyNotion([true, true])).toBe('solid')
  })

  it('needs attention at 3 missed answers in the window', () => {
    expect(classifyNotion([false, false, false])).toBe('needs_attention')
  })

  it('is solid after a miss followed by 4 correct answers', () => {
    expect(classifyNotion([false, true, true, true, true])).toBe('solid')
  })

  it('is steadier when it has misses but is not shaky or solid', () => {
    expect(classifyNotion([true, false, true, true, false, true])).toBe('steadier')
    expect(classifyNotion([true, false])).toBe('steadier')
  })

  it('looks only at the last 6 answers', () => {
    // Window is [false, true, true, true, false, false]: 3 missed.
    expect(classifyNotion([false, false, true, true, true, false, false])).toBe('needs_attention')
    // Old misses fall out of the window: the last 6 are all correct.
    expect(classifyNotion([false, false, false, true, true, true, true, true, true])).toBe('solid')
  })
})
