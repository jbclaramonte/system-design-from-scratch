// Excerpt lookup over the Source Corpus, used to ground generations. Pure and deterministic:
// simple lexical scoring, no embeddings.
import type { CorpusData, CorpusSection, CorpusTopic, ReferenceSolution } from './types'

/** Where an excerpt comes from, ready to cite. */
export interface Citation {
  sectionId: string
  breadcrumb: string[]
  /** Human readable label, for example `System Design Primer > Cache > Cache-aside`. */
  label: string
  url: string
}

export interface Excerpt {
  sectionId: string
  title: string
  breadcrumb: string[]
  /** Section body followed by its Disadvantage(s) blocks. Source(s) blocks are not included. */
  markdown: string
  score: number
  citation: Citation
}

export interface ExcerptQuery {
  /** Free text, for example a topic title or a notion name. */
  query?: string
  /** Corpus section ids. A topic id also selects its sub-topics. */
  sectionIds?: string[]
  /** Maximum number of excerpts (default 5). */
  limit?: number
}

export interface Corpus {
  data: CorpusData
  listTopics(): CorpusTopic[]
  getTopic(id: string): CorpusTopic | undefined
  /** A topic or a sub-topic. */
  getSection(id: string): CorpusSection | undefined
  listReferenceSolutions(): ReferenceSolution[]
  getReferenceSolution(id: string): ReferenceSolution | undefined
  findExcerpts(query: ExcerptQuery): Excerpt[]
}

const STOP_WORDS = new Set(
  'a an and are as at be by can do for from how in is it of on or that the this to vs with'.split(
    ' '
  )
)

/** Lowercase word tokens, stop words dropped, plural `s` stripped. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((token) => !STOP_WORDS.has(token))
    .map((token) =>
      token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token
    )
}

function excerptMarkdown(section: CorpusSection): string {
  return [
    section.markdown,
    ...section.disadvantages.map((d) => `**${d.heading}**\n\n${d.markdown}`)
  ]
    .filter(Boolean)
    .join('\n\n')
}

function counts(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1)
  return map
}

interface IndexedSection {
  section: CorpusSection
  order: number
  titleTerms: Set<string>
  breadcrumbTerms: Set<string>
  bodyCounts: Map<string, number>
  bodyLength: number
}

export function createCorpus(data: CorpusData): Corpus {
  const sections: CorpusSection[] = data.topics.flatMap((topic) => [topic, ...topic.subTopics])
  const byId = new Map(sections.map((section) => [section.id, section]))
  const indexed: IndexedSection[] = sections.map((section, order) => {
    const bodyTokens = tokenize(excerptMarkdown(section).replace(/\(https?:[^)]*\)/g, ' '))
    return {
      section,
      order,
      titleTerms: new Set(tokenize(section.title)),
      breadcrumbTerms: new Set(tokenize(section.breadcrumb.join(' '))),
      bodyCounts: counts(bodyTokens),
      bodyLength: bodyTokens.length
    }
  })
  const documentFrequency = new Map<string, number>()
  for (const entry of indexed) {
    for (const term of entry.bodyCounts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }

  function score(entry: IndexedSection, terms: string[]): number {
    let total = 0
    for (const term of new Set(terms)) {
      const tf = entry.bodyCounts.get(term) ?? 0
      const idf = Math.log(1 + indexed.length / (1 + (documentFrequency.get(term) ?? 0)))
      if (entry.titleTerms.has(term)) total += 3 * idf
      else if (entry.breadcrumbTerms.has(term)) total += idf
      if (tf > 0) total += idf * (1 + Math.log(tf)) * (40 / (40 + Math.sqrt(entry.bodyLength)))
    }
    return Math.round(total * 1000) / 1000
  }

  function toExcerpt(section: CorpusSection, excerptScore: number): Excerpt {
    return {
      sectionId: section.id,
      title: section.title,
      breadcrumb: section.breadcrumb,
      markdown: excerptMarkdown(section),
      score: excerptScore,
      citation: {
        sectionId: section.id,
        breadcrumb: section.breadcrumb,
        label: ['System Design Primer', ...section.breadcrumb].join(' > '),
        url: section.source.url
      }
    }
  }

  return {
    data,
    listTopics: () => data.topics,
    getTopic: (id) => data.topics.find((topic) => topic.id === id),
    getSection: (id) => byId.get(id),
    listReferenceSolutions: () => data.referenceSolutions,
    getReferenceSolution: (id) => data.referenceSolutions.find((solution) => solution.id === id),
    findExcerpts({ query, sectionIds, limit = 5 }) {
      const selected = new Set<string>()
      for (const id of sectionIds ?? []) {
        const section = byId.get(id)
        if (!section) continue
        selected.add(section.id)
        if (section.kind === 'topic')
          data.topics.find((t) => t.id === id)?.subTopics.forEach((s) => selected.add(s.id))
      }
      const terms = tokenize(query ?? '')
      const candidates = indexed.filter(
        (entry) => selected.size === 0 || selected.has(entry.section.id)
      )
      if (terms.length === 0) {
        if (selected.size === 0) return []
        return candidates.slice(0, limit).map((entry) => toExcerpt(entry.section, 0))
      }
      return candidates
        .map((entry) => ({ entry, score: score(entry, terms) }))
        .filter(({ score: s }) => s > 0)
        .sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
        .slice(0, limit)
        .map(({ entry, score: s }) => toExcerpt(entry.section, s))
    }
  }
}

/** Rough token estimate (about 4 characters per token for English Markdown). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface Budget {
  maxChars?: number
  maxTokens?: number
}

/**
 * Keeps excerpts in order while they fit the budget. If even the first one does not fit, it is
 * truncated so that the result is never empty when excerpts were given.
 */
export function fitExcerptsToBudget(
  excerpts: Excerpt[],
  budget: Budget
): { excerpts: Excerpt[]; chars: number; truncated: boolean } {
  const maxChars = Math.min(budget.maxChars ?? Infinity, (budget.maxTokens ?? Infinity) * 4)
  const kept: Excerpt[] = []
  let chars = 0
  for (const excerpt of excerpts) {
    const length = excerpt.markdown.length
    if (chars + length <= maxChars) {
      kept.push(excerpt)
      chars += length
      continue
    }
    if (kept.length === 0 && maxChars > 0) {
      const markdown = `${excerpt.markdown.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
      return { excerpts: [{ ...excerpt, markdown }], chars: markdown.length, truncated: true }
    }
    return { excerpts: kept, chars, truncated: true }
  }
  return { excerpts: kept, chars, truncated: false }
}
