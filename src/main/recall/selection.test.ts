import { describe, expect, it } from 'vitest'
import type { NotionRecallStatus } from './memory'
import { selectRecallQuestions, type RecallCandidate } from './selection'

/** Deterministic generator (mulberry32) so the probabilistic tests never flake. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const NOW = new Date('2026-10-26T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

const candidate = (
  questionId: number,
  overrides: Partial<RecallCandidate> = {}
): RecallCandidate => ({
  questionId,
  topicId: 1,
  notionIds: [questionId],
  origin: 'reused',
  lastAskedAt: daysAgo(14),
  ...overrides
})

const pool = (count: number, overrides: Partial<RecallCandidate> = {}) =>
  Array.from({ length: count }, (_, index) => candidate(index + 1, overrides))

const select = (
  candidates: RecallCandidate[],
  options: {
    status?: Map<number, NotionRecallStatus | 'untracked'>
    random?: () => number
    size?: number
    maxNew?: number
  } = {}
) =>
  selectRecallQuestions({
    candidates,
    status: options.status ?? new Map(),
    now: NOW,
    random: options.random ?? seeded(1),
    size: options.size,
    maxNew: options.maxNew
  })

describe('selectRecallQuestions', () => {
  it('never returns more than size, 6 by default', () => {
    expect(select(pool(20))).toHaveLength(6)
    expect(select(pool(20), { size: 4 })).toHaveLength(4)
  })

  it('returns fewer than size with fewer candidates, and nothing for none', () => {
    expect(select(pool(3))).toHaveLength(3)
    expect(select([])).toEqual([])
  })

  it('never repeats a question', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ids = select(pool(10), { random: seeded(seed) })
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('takes at most maxNew new questions, 3 by default, and plays them first', () => {
    const candidates = [
      ...pool(5, { origin: 'new', lastAskedAt: null }),
      ...pool(5).map((c) => ({ ...c, questionId: c.questionId + 100 }))
    ]
    for (let seed = 1; seed <= 20; seed++) {
      const ids = select(candidates, { random: seeded(seed) })
      expect(ids).toHaveLength(6)
      const origins = ids.map((id) => candidates.find((c) => c.questionId === id)!.origin)
      expect(origins.slice(0, 3)).toEqual(['new', 'new', 'new'])
      expect(origins.slice(3)).toEqual(['reused', 'reused', 'reused'])
    }
    const one = select(candidates, { maxNew: 1 })
    expect(one.filter((id) => id < 100)).toHaveLength(1)
    expect(one[0]).toBeLessThan(100)
  })

  it('does not exceed maxNew even when reused questions run out', () => {
    const candidates = [
      ...pool(5, { origin: 'new', lastAskedAt: null }),
      ...pool(1).map((c) => ({ ...c, questionId: 100 }))
    ]
    const ids = select(candidates)
    expect(ids).toHaveLength(4)
    expect(ids[3]).toBe(100)
  })

  it('fills from reused questions when there are fewer new ones than maxNew', () => {
    const candidates = [
      candidate(1, { origin: 'new', lastAskedAt: null }),
      ...pool(8).map((c) => ({ ...c, questionId: c.questionId + 100 }))
    ]
    const ids = select(candidates)
    expect(ids[0]).toBe(1)
    expect(ids).toHaveLength(6)
  })

  it('favors a question on a needs_attention notion over one on a solid notion', () => {
    const candidates = pool(10)
    const status = new Map<number, NotionRecallStatus | 'untracked'>(
      candidates.map((c) => [c.questionId, 'solid'])
    )
    status.set(1, 'needs_attention')
    let shaky = 0
    let solid = 0
    for (let seed = 1; seed <= 200; seed++) {
      const ids = select(candidates, { status, size: 2, random: seeded(seed) })
      if (ids.includes(1)) shaky++
      if (ids.includes(2)) solid++
    }
    expect(shaky).toBeGreaterThan(solid * 2)
    expect(shaky).toBeGreaterThan(100)
  })

  it('weights steadier above solid and below needs_attention', () => {
    const candidates = pool(10)
    const status = new Map<number, NotionRecallStatus | 'untracked'>(
      candidates.map((c) => [c.questionId, 'solid'])
    )
    status.set(1, 'needs_attention')
    status.set(2, 'steadier')
    const counts = { shaky: 0, steadier: 0, solid: 0 }
    for (let seed = 1; seed <= 400; seed++) {
      const ids = select(candidates, { status, size: 1, random: seeded(seed) })
      if (ids[0] === 1) counts.shaky++
      else if (ids[0] === 2) counts.steadier++
      else counts.solid++
    }
    expect(counts.shaky).toBeGreaterThan(counts.steadier)
    // Eight solid candidates share the rest: compare with one of them on average.
    expect(counts.steadier).toBeGreaterThan(counts.solid / 8)
  })

  it('uses the highest status among the notions of a question', () => {
    const candidates = [
      candidate(1, { notionIds: [1, 2] }),
      candidate(2, { notionIds: [3] }),
      candidate(3, { notionIds: [3] }),
      candidate(4, { notionIds: [3] })
    ]
    const status = new Map<number, NotionRecallStatus | 'untracked'>([
      [1, 'solid'],
      [2, 'needs_attention'],
      [3, 'solid']
    ])
    let multi = 0
    for (let seed = 1; seed <= 200; seed++) {
      if (select(candidates, { status, size: 1, random: seeded(seed) })[0] === 1) multi++
    }
    // Weight 4 against three of weight 1: about 57% of the draws, against 25% for a plain one.
    expect(multi).toBeGreaterThan(90)
  })

  it('favors questions asked long ago over questions asked recently', () => {
    const candidates = [
      candidate(1, { lastAskedAt: daysAgo(0) }),
      candidate(2, { lastAskedAt: daysAgo(21) })
    ]
    let recent = 0
    let old = 0
    for (let seed = 1; seed <= 200; seed++) {
      const [id] = select(candidates, { size: 1, random: seeded(seed) })
      if (id === 1) recent++
      else old++
    }
    expect(old).toBeGreaterThan(recent * 2)
  })

  it('does not penalize a question that was never asked', () => {
    // A never-asked question weighs as much as one asked 3 weeks ago or more.
    const candidates = [
      candidate(1, { lastAskedAt: null }),
      candidate(2, { lastAskedAt: daysAgo(60) })
    ]
    let neverAsked = 0
    for (let seed = 1; seed <= 200; seed++) {
      if (select(candidates, { size: 1, random: seeded(seed) })[0] === 1) neverAsked++
    }
    expect(neverAsked).toBeGreaterThan(70)
    expect(neverAsked).toBeLessThan(130)
  })
})
