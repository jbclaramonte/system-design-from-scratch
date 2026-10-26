import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MemoryReviewNotion, MemoryReviewView, RecallStart } from '../../../shared/recall'
import { attentionNotionIds, requestPractice } from './memoryReviewLogic'

const notion = (id: number): MemoryReviewNotion => ({
  notion: { id, slug: `n${id}`, title: `Notion ${id}` },
  topicTitle: 'Cache',
  topicSlug: 'cache',
  lastResults: [true, false],
  missed: 1,
  of: 2,
  lastSeenAt: null,
  sourceSections: []
})

const view = (attention: number[]): MemoryReviewView => ({
  tracked: attention.length + 1,
  needsAttention: attention.length,
  steadier: 0,
  solid: 1,
  groups: { needs_attention: attention.map(notion), steadier: [], solid: [notion(99)] }
})

const started = { session: { id: 1 }, questions: [], answered: [] } as unknown as RecallStart

describe('attentionNotionIds', () => {
  it('lists the Notions of the needs-attention group only', () => {
    expect(attentionNotionIds(view([3, 5]))).toEqual([3, 5])
    expect(attentionNotionIds(view([]))).toEqual([])
  })
})

describe('requestPractice', () => {
  afterEach(() => vi.restoreAllMocks())

  it('passes the Notion ids and returns the started session', async () => {
    const call = vi.fn().mockResolvedValue(started)
    await expect(requestPractice(call, [4])).resolves.toEqual({ kind: 'started', start: started })
    expect(call).toHaveBeenCalledWith({ notionIds: [4] })
  })

  it('says "empty" when there is nothing to practice yet', async () => {
    await expect(requestPractice(vi.fn().mockResolvedValue(null), [4])).resolves.toEqual({
      kind: 'empty'
    })
  })

  it('says "failed", not "empty", when the call fails, and logs the error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = new Error('boom')
    await expect(requestPractice(vi.fn().mockRejectedValue(error), [4])).resolves.toEqual({
      kind: 'failed'
    })
    expect(warn).toHaveBeenCalledWith(expect.any(String), error)
  })

  it('does not call at all without Notions: the empty list means "everything" for the service', async () => {
    const call = vi.fn()
    await expect(requestPractice(call, [])).resolves.toEqual({ kind: 'empty' })
    expect(call).not.toHaveBeenCalled()
  })
})
