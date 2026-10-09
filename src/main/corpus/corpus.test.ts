// Checks the committed artifact, resources/corpus/primer.json.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { corpusPath, loadCorpus } from './index'
import { SOLUTION_IDS } from './ingest'

const path = corpusPath(process.cwd())
const corpus = loadCorpus(path)
const { metadata } = corpus.data

describe('bundled Source Corpus', () => {
  it('carries license, attribution and pinned source metadata', () => {
    expect(metadata.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(metadata.license.spdx).toBe('CC-BY-4.0')
    expect(metadata.license.upstreamNotice).toContain('CC BY 4.0')
    expect(metadata.attribution).toContain(metadata.commitSha)
    expect(metadata.modifications).not.toBe('')
    expect(metadata.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps stable ids for core topics', () => {
    for (const id of [
      'performance-vs-scalability',
      'availability-vs-consistency/cap-theorem',
      'load-balancer/horizontal-scaling',
      'database/relational-database-management-system-rdbms',
      'cache/when-to-update-the-cache',
      'communication/remote-procedure-call-rpc'
    ]) {
      expect(corpus.getSection(id), id).toBeDefined()
    }
  })

  it('holds the 8 system design Reference Solutions', () => {
    expect(corpus.listReferenceSolutions().map((s) => s.id)).toEqual(SOLUTION_IDS)
    for (const solution of corpus.listReferenceSolutions()) {
      expect(solution.steps.length, solution.id).toBeGreaterThanOrEqual(4)
      expect(solution.useCases, solution.id).not.toBe('')
      expect(solution.diagramFiles.length, solution.id).toBeGreaterThan(0)
    }
  })

  it('bundles primer files only, no third-party content and no Anki decks', () => {
    expect(
      metadata.files.every((f) => f === 'README.md' || f.startsWith('solutions/system_design/'))
    ).toBe(true)
    const json = readFileSync(path, 'utf8')
    expect(json).not.toContain('.apkg')
    const primerUrl = `${metadata.repositoryUrl}/blob/${metadata.commitSha}/`
    for (const topic of corpus.listTopics()) {
      for (const section of [topic, ...topic.subTopics]) {
        expect(section.source.url.startsWith(primerUrl)).toBe(true)
        for (const part of section.sources) {
          for (const link of part.links) expect(link.url).toMatch(/^https?:\/\//)
        }
      }
    }
  })

  it('answers a lookup with citable excerpts', () => {
    const [first] = corpus.findExcerpts({ query: 'cache aside write through', limit: 3 })
    expect(first?.sectionId).toBe('cache/when-to-update-the-cache')
    expect(first?.citation.url).toContain('#when-to-update-the-cache')
  })
})
