// Pure ingestion of the System Design Primer Markdown into the Source Corpus shape.
// Used at build time by scripts/build-corpus.ts, which runs under plain node (type stripping),
// so this file must keep erasable TypeScript only and import types only.
import type {
  CorpusData,
  CorpusLink,
  CorpusSubTopic,
  CorpusTopic,
  DiagramRef,
  ReferenceSolution,
  SectionPart,
  SolutionStep,
  SourceRef
} from './types'

export const CORPUS_SCHEMA_VERSION = 1
export const PRIMER_REPOSITORY = 'donnemartin/system-design-primer'
export const PRIMER_URL = `https://github.com/${PRIMER_REPOSITORY}`

/** Meta sections of the primer README that carry no system design content. */
export const EXCLUDED_SECTIONS = [
  'Anki flashcards',
  'Contributing',
  'Index of system design topics',
  'Under development',
  'Credits',
  'Contact info',
  'License'
]

/** The 8 system design solutions, by upstream folder name, in primer order. */
export const SOLUTION_IDS = [
  'pastebin',
  'twitter',
  'web_crawler',
  'mint',
  'social_graph',
  'query_cache',
  'sales_rank',
  'scaling_aws'
]

interface Heading {
  level: number
  text: string
  anchor: string
}

type Line = { heading: Heading } | { text: string }

/** Lowercase slug used for stable corpus ids. */
export function slugify(text: string): string {
  return stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** GitHub heading anchor (before duplicate suffixing). */
export function githubAnchor(text: string): string {
  return stripInlineMarkdown(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
}

function stripInlineMarkdown(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '')
}

/** Splits Markdown into lines and headings, ignoring `#` lines inside code fences. */
function tokenize(markdown: string): Line[] {
  const lines: Line[] = []
  const anchorCounts = new Map<string, number>()
  let inFence = false
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) inFence = !inFence
    const match = inFence ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw)
    if (match && match[1] && match[2] !== undefined) {
      const base = githubAnchor(match[2])
      const seen = anchorCounts.get(base) ?? 0
      anchorCounts.set(base, seen + 1)
      const anchor = seen === 0 ? base : `${base}-${seen}`
      lines.push({ heading: { level: match[1].length, text: match[2].trim(), anchor } })
    } else {
      lines.push({ text: raw })
    }
  }
  return lines
}

/** Links to web pages, kept as URLs only. */
export function extractLinks(markdown: string): CorpusLink[] {
  const links: CorpusLink[] = []
  for (const match of markdown.matchAll(/(?<!!)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    links.push({ text: match[1] ?? '', url: match[2] ?? '' })
  }
  return links
}

/** Image paths or URLs referenced by Markdown or inline HTML. */
export function extractImages(markdown: string): { alt: string; url: string }[] {
  const images: { alt: string; url: string }[] = []
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)|<img[^>]*\ssrc="([^"]+)"/g)) {
    images.push({ alt: match[1] ?? '', url: match[2] ?? match[3] ?? '' })
  }
  return images
}

function partKind(headingText: string): 'disadvantages' | 'sources' | null {
  if (/^disadvantage\(s\)/i.test(headingText)) return 'disadvantages'
  if (/^source\(s\) and further reading/i.test(headingText)) return 'sources'
  return null
}

function sourceRef(sha: string, path: string, anchor: string): SourceRef {
  return { path, anchor, url: `${PRIMER_URL}/blob/${sha}/${path}${anchor ? `#${anchor}` : ''}` }
}

function joinLines(lines: string[]): string {
  return lines.join('\n').trim()
}

function uniqueId(id: string, taken: Set<string>): string {
  let candidate = id
  for (let n = 2; taken.has(candidate); n++) candidate = `${id}-${n}`
  taken.add(candidate)
  return candidate
}

interface SectionDraft {
  id: string
  title: string
  breadcrumb: string[]
  anchor: string
  body: string[]
  parts: { kind: 'disadvantages' | 'sources'; heading: string; lines: string[] }[]
}

function newDraft(id: string, heading: Heading, breadcrumb: string[]): SectionDraft {
  return { id, title: heading.text, breadcrumb, anchor: heading.anchor, body: [], parts: [] }
}

function finishParts(draft: SectionDraft, kind: 'disadvantages' | 'sources'): SectionPart[] {
  return draft.parts
    .filter((part) => part.kind === kind)
    .map((part) => {
      const markdown = joinLines(part.lines)
      return { heading: part.heading, markdown, links: extractLinks(markdown) }
    })
}

function finishSection(draft: SectionDraft, sha: string, path: string) {
  const markdown = joinLines(draft.body)
  return {
    id: draft.id,
    title: draft.title,
    breadcrumb: draft.breadcrumb,
    markdown,
    disadvantages: finishParts(draft, 'disadvantages'),
    sources: finishParts(draft, 'sources'),
    images: extractImages(markdown).map((image) => image.url),
    source: sourceRef(sha, path, draft.anchor)
  }
}

export interface SplitPrimerResult {
  topics: CorpusTopic[]
  /** Body of the primer's own License section. */
  licenseNotice: string
}

/**
 * Splits the primer README by heading: `##` become topics, `###` sub-topics. Deeper headings stay
 * in the body of their section. Disadvantage(s) and Source(s) blocks become separate parts of the
 * section they belong to: a `###` block belongs to its topic, a deeper one to its sub-topic.
 */
export function splitPrimer(
  markdown: string,
  options: { sha: string; path?: string; excludedSections?: string[] }
): SplitPrimerResult {
  const path = options.path ?? 'README.md'
  const excluded = new Set((options.excludedSections ?? EXCLUDED_SECTIONS).map(slugify))
  const topicDrafts: { draft: SectionDraft; subs: SectionDraft[] }[] = []
  const topicIds = new Set<string>()
  const licenseLines: string[] = []
  let inLicense = false
  let topic: { draft: SectionDraft; subs: SectionDraft[]; subIds: Set<string> } | null = null
  let sub: SectionDraft | null = null
  let part: { level: number; lines: string[] } | null = null
  let skipping = true

  for (const line of tokenize(markdown)) {
    if ('heading' in line) {
      const { heading } = line
      if (part && heading.level <= part.level) part = null
      if (heading.level <= 2) {
        topic = null
        sub = null
        part = null
        skipping = heading.level === 1 || excluded.has(slugify(heading.text))
        inLicense = heading.level === 2 && slugify(heading.text) === 'license'
        if (!skipping) {
          const id = uniqueId(slugify(heading.text), topicIds)
          topic = { draft: newDraft(id, heading, [heading.text]), subs: [], subIds: new Set() }
          topicDrafts.push(topic)
        }
        continue
      }
      if (skipping || !topic) {
        if (inLicense) licenseLines.push(`${'#'.repeat(heading.level)} ${heading.text}`)
        continue
      }
      const kind = partKind(heading.text)
      if (kind) {
        const owner = heading.level === 3 ? topic.draft : (sub ?? topic.draft)
        if (heading.level === 3) sub = null
        const lines: string[] = []
        owner.parts.push({ kind, heading: heading.text, lines })
        part = { level: heading.level, lines }
        continue
      }
      if (heading.level === 3) {
        const id = `${topic.draft.id}/${uniqueId(slugify(heading.text), topic.subIds)}`
        sub = newDraft(id, heading, [topic.draft.title, heading.text])
        topic.subs.push(sub)
        continue
      }
      const target = part?.lines ?? (sub ?? topic.draft).body
      target.push(`${'#'.repeat(heading.level)} ${heading.text}`)
      continue
    }
    if (skipping || !topic) {
      if (inLicense) licenseLines.push(line.text)
      continue
    }
    const target = part?.lines ?? (sub ?? topic.draft).body
    target.push(line.text)
  }

  const sha = options.sha
  const topics = topicDrafts.map(({ draft, subs }): CorpusTopic => {
    const subTopics = subs.map((subDraft): CorpusSubTopic => ({
      ...finishSection(subDraft, sha, path),
      kind: 'sub-topic',
      topicId: draft.id
    }))
    return { ...finishSection(draft, sha, path), kind: 'topic', subTopics }
  })
  return { topics, licenseNotice: joinLines(licenseLines) }
}

/** Maps an imgur URL used by the solutions to the copy kept in the upstream `images/` folder. */
function upstreamImagePath(url: string, solutionDir: string, upstreamFiles: Set<string>) {
  const imgur = /i\.imgur\.com\/([A-Za-z0-9]+)\.(\w+)$/.exec(url)
  const candidates = imgur ? [`images/${imgur[1]}.${imgur[2]}`] : [url, `${solutionDir}/${url}`]
  return candidates.find((candidate) => upstreamFiles.has(candidate)) ?? null
}

/** Parses one solutions/system_design/<id>/README.md into a Reference Solution. */
export function parseSolution(
  markdown: string,
  options: { id: string; sha: string; upstreamFiles: string[] }
): ReferenceSolution {
  const dir = `solutions/system_design/${options.id}`
  const path = `${dir}/README.md`
  const files = new Set(options.upstreamFiles)
  let title = ''
  let titleAnchor = ''
  const intro: string[] = []
  const steps: { draft: SectionDraft; lines: string[] }[] = []
  const stepIds = new Set<string>()
  const step1Blocks = new Map<string, string[]>()
  let step1Block: string[] | null = null

  for (const line of tokenize(markdown)) {
    if ('heading' in line && line.heading.level === 1 && !title) {
      title = line.heading.text
      titleAnchor = line.heading.anchor
      continue
    }
    if ('heading' in line && line.heading.level === 2) {
      const id = uniqueId(slugify(line.heading.text), stepIds)
      steps.push({ draft: newDraft(id, line.heading, [title, line.heading.text]), lines: [] })
      step1Block = null
      continue
    }
    const text =
      'heading' in line ? `${'#'.repeat(line.heading.level)} ${line.heading.text}` : line.text
    const current = steps.at(-1)
    if (!current) {
      intro.push(text)
      continue
    }
    current.lines.push(text)
    if (steps.length === 1 && 'heading' in line && line.heading.level === 3) {
      step1Block = []
      step1Blocks.set(slugify(line.heading.text), step1Block)
      continue
    }
    step1Block?.push(text)
  }

  const solutionSteps: SolutionStep[] = steps.map(({ draft, lines }) => ({
    id: draft.id,
    title: draft.title,
    markdown: joinLines(lines)
  }))
  const diagrams: DiagramRef[] = extractImages(markdown).map((image) => ({
    alt: image.alt,
    referencedUrl: image.url,
    upstreamPath: upstreamImagePath(image.url, dir, files)
  }))
  const folderFiles = options.upstreamFiles
    .filter((file) => file.startsWith(`${dir}/`) && !file.slice(dir.length + 1).includes('/'))
    .sort()
  return {
    id: options.id,
    title,
    problemStatement: joinLines(intro),
    useCases: joinLines(step1Blocks.get('use-cases') ?? []),
    constraints: joinLines(step1Blocks.get('constraints-and-assumptions') ?? []),
    steps: solutionSteps,
    markdown: markdown.trim(),
    diagrams,
    diagramFiles: folderFiles.filter((file) => /\.(png|jpe?g|gif|svg)$/i.test(file)),
    codeFiles: folderFiles.filter((file) => file.endsWith('.py') && !file.endsWith('__init__.py')),
    source: sourceRef(options.sha, path, titleAnchor)
  }
}

export interface BuildCorpusInput {
  sha: string
  fetchedAt: string
  readme: string
  solutions: { id: string; markdown: string }[]
  /** Every file path of the upstream tree at `sha`, used to resolve diagram files. */
  upstreamFiles: string[]
}

/** Assembles the full corpus artifact, license and attribution metadata included. */
export function buildCorpus(input: BuildCorpusInput): CorpusData {
  const { topics, licenseNotice } = splitPrimer(input.readme, { sha: input.sha })
  const referenceSolutions = input.solutions.map((solution) =>
    parseSolution(solution.markdown, {
      id: solution.id,
      sha: input.sha,
      upstreamFiles: input.upstreamFiles
    })
  )
  return {
    metadata: {
      schemaVersion: CORPUS_SCHEMA_VERSION,
      repository: PRIMER_REPOSITORY,
      repositoryUrl: PRIMER_URL,
      commitSha: input.sha,
      fetchedAt: input.fetchedAt,
      generator: 'scripts/build-corpus.ts',
      files: [
        'README.md',
        ...input.solutions.map((s) => `solutions/system_design/${s.id}/README.md`)
      ],
      license: {
        name: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
        spdx: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        upstreamNotice: licenseNotice
      },
      attribution:
        `Content from "The System Design Primer" by Donne Martin and contributors ` +
        `(${PRIMER_URL}), commit ${input.sha}, licensed under CC BY 4.0 ` +
        `(https://creativecommons.org/licenses/by/4.0/).`,
      modifications:
        'Modified from the original: the English README.md is split into sections by ' +
        'Markdown heading, with Disadvantage(s) and Source(s) blocks stored separately; meta ' +
        `sections (${EXCLUDED_SECTIONS.join(', ')}) are left out; the 8 system design solutions ` +
        'are split into steps. Images, code files, Anki decks and translations are not bundled.',
      thirdPartyContent:
        'Third-party pages linked from the primer (for example in Source(s) and further ' +
        'reading) are not covered by its license and are not bundled; only their URLs are kept.',
      excludedSections: EXCLUDED_SECTIONS
    },
    topics,
    referenceSolutions
  }
}
