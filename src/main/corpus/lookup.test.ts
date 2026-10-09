import { describe, expect, it } from 'vitest'
import { FIXTURE_SHA, PRIMER_FIXTURE, SOLUTION_FIXTURE, UPSTREAM_FILES_FIXTURE } from './fixtures'
import { buildCorpus } from './ingest'
import { createCorpus, estimateTokens, fitExcerptsToBudget, tokenize, type Excerpt } from './lookup'

const corpus = createCorpus(
  buildCorpus({
    sha: FIXTURE_SHA,
    fetchedAt: '2026-10-08',
    readme: PRIMER_FIXTURE,
    solutions: [{ id: 'pastebin', markdown: SOLUTION_FIXTURE }],
    upstreamFiles: UPSTREAM_FILES_FIXTURE
  })
)

describe('corpus accessors', () => {
  it('lists and gets topics, sections and reference solutions', () => {
    expect(corpus.listTopics().map((t) => t.id)).toEqual(['cache', 'load-balancer'])
    expect(corpus.getTopic('cache')?.title).toBe('Cache')
    expect(corpus.getTopic('cache/client-caching')).toBeUndefined()
    expect(corpus.getSection('cache/client-caching')?.kind).toBe('sub-topic')
    expect(corpus.getReferenceSolution('pastebin')?.steps).toHaveLength(4)
  })
})

describe('findExcerpts', () => {
  it('ranks the section whose title matches first', () => {
    const ids = corpus.findExcerpts({ query: 'horizontal scaling' }).map((e) => e.sectionId)
    expect(ids[0]).toBe('load-balancer/horizontal-scaling')
  })

  it('finds text inside nested headings and disadvantages', () => {
    const [first] = corpus.findExcerpts({ query: 'cache-aside lazy loading', limit: 1 })
    expect(first?.sectionId).toBe('cache/when-to-update-the-cache')
    expect(first?.markdown).toContain('three trips')
    expect(first?.citation).toEqual({
      sectionId: 'cache/when-to-update-the-cache',
      breadcrumb: ['Cache', 'When to update the cache'],
      label: 'System Design Primer > Cache > When to update the cache',
      url: `https://github.com/donnemartin/system-design-primer/blob/${FIXTURE_SHA}/README.md#when-to-update-the-cache`
    })
  })

  it('restricts to section ids, a topic id including its sub-topics', () => {
    const ids = corpus.findExcerpts({ sectionIds: ['cache'] }).map((e) => e.sectionId)
    expect(ids).toEqual(['cache', 'cache/client-caching', 'cache/when-to-update-the-cache'])
    const scoped = corpus.findExcerpts({ query: 'scaling', sectionIds: ['cache'] })
    expect(scoped.every((e) => e.sectionId.startsWith('cache'))).toBe(true)
  })

  it('is deterministic, honours the limit and ignores unknown terms', () => {
    const query = { query: 'cache load', limit: 2 }
    expect(corpus.findExcerpts(query)).toEqual(corpus.findExcerpts(query))
    expect(corpus.findExcerpts(query)).toHaveLength(2)
    expect(corpus.findExcerpts({ query: 'zzzz' })).toEqual([])
    expect(corpus.findExcerpts({})).toEqual([])
  })

  it('does not index link URLs or Source(s) blocks', () => {
    expect(corpus.findExcerpts({ query: 'horicky slideshare' })).toEqual([])
  })
})

describe('budget helpers', () => {
  const excerpt = (sectionId: string, length: number): Excerpt => ({
    sectionId,
    title: sectionId,
    breadcrumb: [sectionId],
    markdown: 'x'.repeat(length),
    score: 1,
    citation: { sectionId, breadcrumb: [sectionId], label: sectionId, url: '' }
  })

  it('estimates tokens and tokenizes', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(tokenize('The Caches and load-balancers')).toEqual(['cache', 'load', 'balancer'])
  })

  it('keeps whole excerpts while they fit', () => {
    const result = fitExcerptsToBudget([excerpt('a', 50), excerpt('b', 40), excerpt('c', 20)], {
      maxChars: 100
    })
    expect(result.excerpts.map((e) => e.sectionId)).toEqual(['a', 'b'])
    expect(result).toMatchObject({ chars: 90, truncated: true })
  })

  it('truncates the first excerpt when it alone exceeds the budget', () => {
    const result = fitExcerptsToBudget([excerpt('a', 100)], { maxTokens: 5 })
    expect(result.excerpts[0]?.markdown).toHaveLength(20)
    expect(result.truncated).toBe(true)
  })
})
