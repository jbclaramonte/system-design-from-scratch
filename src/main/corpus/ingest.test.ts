import { describe, expect, it } from 'vitest'
import { FIXTURE_SHA, PRIMER_FIXTURE, SOLUTION_FIXTURE, UPSTREAM_FILES_FIXTURE } from './fixtures'
import { buildCorpus, githubAnchor, parseSolution, slugify, splitPrimer } from './ingest'

const split = () => splitPrimer(PRIMER_FIXTURE, { sha: FIXTURE_SHA })

describe('slugify and githubAnchor', () => {
  it('builds id slugs', () => {
    expect(slugify('Reverse proxy (web server)')).toBe('reverse-proxy-web-server')
    expect(slugify("Design Amazon's sales ranking")).toBe('design-amazon-s-sales-ranking')
  })

  it('follows GitHub anchor rules', () => {
    expect(githubAnchor('Disadvantage(s): failover')).toBe('disadvantages-failover')
    expect(githubAnchor('99.9% availability - three 9s')).toBe('999-availability---three-9s')
  })
})

describe('splitPrimer', () => {
  it('splits ## into topics and ### into sub-topics, skipping meta sections', () => {
    const { topics } = split()
    expect(topics.map((t) => t.id)).toEqual(['cache', 'load-balancer'])
    expect(topics[0]?.subTopics.map((s) => s.id)).toEqual([
      'cache/client-caching',
      'cache/when-to-update-the-cache'
    ])
    expect(topics[0]?.subTopics[1]?.breadcrumb).toEqual(['Cache', 'When to update the cache'])
    expect(topics[0]?.subTopics[1]?.topicId).toBe('cache')
  })

  it('keeps deeper headings and code fences in the body', () => {
    const body = split().topics[0]?.subTopics[1]?.markdown ?? ''
    expect(body).toContain('#### Cache-aside')
    expect(body).toContain('#### Write-through')
    expect(body).toContain('# not a heading, inside a code fence')
    expect(body).not.toContain('three trips')
  })

  it('stores Disadvantage(s) and Source(s) blocks apart, on the section they belong to', () => {
    const [cache, loadBalancer] = split().topics
    expect(cache?.markdown).not.toContain('source of truth')
    expect(cache?.disadvantages.map((d) => d.heading)).toEqual(['Disadvantage(s): cache'])
    expect(cache?.subTopics[1]?.disadvantages).toEqual([
      {
        heading: 'Disadvantage(s): cache-aside',
        markdown: '* Each cache miss results in three trips.',
        links: []
      }
    ])
    expect(cache?.sources[0]?.links.map((l) => l.url)).toEqual([
      'http://www.slideshare.net/tmatyashovsky/from-cache-to-in-memory-data-grid',
      'http://horicky.blogspot.com/2010/10/scalable-system-design-patterns.html'
    ])
    expect(loadBalancer?.subTopics[0]?.disadvantages[0]?.heading).toBe(
      'Disadvantage(s): horizontal scaling'
    )
    expect(loadBalancer?.sources).toHaveLength(1)
  })

  it('references the source section with GitHub anchors, duplicates suffixed', () => {
    const [cache, loadBalancer] = split().topics
    expect(cache?.source).toEqual({
      path: 'README.md',
      anchor: 'cache',
      url: `https://github.com/donnemartin/system-design-primer/blob/${FIXTURE_SHA}/README.md#cache`
    })
    expect(cache?.images).toEqual(['images/Q6z24La.png'])
    expect(loadBalancer?.subTopics[0]?.source.anchor).toBe('horizontal-scaling')
  })

  it('keeps ids stable when unrelated sections change', () => {
    const before = split().topics.flatMap((t) => [t.id, ...t.subTopics.map((s) => s.id)])
    const edited = PRIMER_FIXTURE.replace(
      '## Cache',
      '## Domain name system\n\nA DNS translates a domain name.\n\n### Push\n\nText.\n\n## Cache'
    )
    const after = splitPrimer(edited, { sha: FIXTURE_SHA }).topics.flatMap((t) => [
      t.id,
      ...t.subTopics.map((s) => s.id)
    ])
    expect(after.filter((id) => !id.startsWith('domain-name-system'))).toEqual(before)
  })

  it('captures the license notice and leaves out meta sections', () => {
    const { topics, licenseNotice } = split()
    expect(licenseNotice).toContain('CC BY 4.0')
    expect(JSON.stringify(topics)).not.toContain('.apkg')
  })
})

describe('parseSolution', () => {
  const solution = parseSolution(SOLUTION_FIXTURE, {
    id: 'pastebin',
    sha: FIXTURE_SHA,
    upstreamFiles: UPSTREAM_FILES_FIXTURE
  })

  it('extracts problem statement, constraints and steps', () => {
    expect(solution.title).toBe('Design Pastebin.com (or Bit.ly)')
    expect(solution.problemStatement).toBe('**Design Bit.ly** - is a similar question.')
    expect(solution.useCases).toContain('randomly generated link')
    expect(solution.constraints).toBe('* 10 million users')
    expect(solution.steps.map((s) => s.id)).toEqual([
      'step-1-outline-use-cases-and-constraints',
      'step-2-create-a-high-level-design',
      'step-3-design-core-components',
      'step-4-scale-the-design'
    ])
  })

  it('lists diagrams and code files without bundling them', () => {
    expect(solution.diagrams.map((d) => d.upstreamPath)).toEqual([null, 'images/4edXG0T.png'])
    expect(solution.diagramFiles).toEqual([
      'solutions/system_design/pastebin/pastebin.png',
      'solutions/system_design/pastebin/pastebin_basic.png'
    ])
    expect(solution.codeFiles).toEqual(['solutions/system_design/pastebin/pastebin.py'])
  })
})

describe('buildCorpus', () => {
  it('stores license, attribution and modification notice', () => {
    const { metadata } = buildCorpus({
      sha: FIXTURE_SHA,
      fetchedAt: '2026-10-08',
      readme: PRIMER_FIXTURE,
      solutions: [{ id: 'pastebin', markdown: SOLUTION_FIXTURE }],
      upstreamFiles: UPSTREAM_FILES_FIXTURE
    })
    expect(metadata.commitSha).toBe(FIXTURE_SHA)
    expect(metadata.license.spdx).toBe('CC-BY-4.0')
    expect(metadata.license.url).toBe('https://creativecommons.org/licenses/by/4.0/')
    expect(metadata.attribution).toContain('Donne Martin')
    expect(metadata.modifications).toMatch(/^Modified/)
    expect(metadata.files).toEqual(['README.md', 'solutions/system_design/pastebin/README.md'])
  })
})
