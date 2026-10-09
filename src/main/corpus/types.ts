/** Shape of resources/corpus/primer.json, the bundled Source Corpus. */

/** A link kept from the primer. Only the URL is bundled, never the linked content. */
export interface CorpusLink {
  text: string
  url: string
}

/** A "Disadvantage(s)" or "Source(s) and further reading" block, kept apart from the body. */
export interface SectionPart {
  heading: string
  markdown: string
  links: CorpusLink[]
}

/** Where a section comes from in the primer, for citation. */
export interface SourceRef {
  /** Upstream file path, for example `README.md`. */
  path: string
  /** GitHub heading anchor, without the leading `#`. */
  anchor: string
  /** Permalink at the pinned commit. */
  url: string
}

/** A `##` (topic) or `###` (sub-topic) section of the primer README. */
export interface CorpusSection {
  /** Stable slug path: `cache` for a topic, `cache/cache-aside` style for a sub-topic. */
  id: string
  kind: 'topic' | 'sub-topic'
  title: string
  /** Heading titles from the topic down to this section. */
  breadcrumb: string[]
  /** Raw Markdown body, deeper headings included, Disadvantage(s) and Source(s) blocks excluded. */
  markdown: string
  disadvantages: SectionPart[]
  sources: SectionPart[]
  /** Upstream image paths referenced by the body (not bundled). */
  images: string[]
  source: SourceRef
}

export interface CorpusTopic extends CorpusSection {
  kind: 'topic'
  subTopics: CorpusSubTopic[]
}

export interface CorpusSubTopic extends CorpusSection {
  kind: 'sub-topic'
  topicId: string
}

/** One `##` section of a Reference Solution (Step 1..4, Additional talking points). */
export interface SolutionStep {
  id: string
  title: string
  markdown: string
}

export interface DiagramRef {
  alt: string
  /** URL or path as written in the solution. */
  referencedUrl: string
  /** Matching file in the upstream repo, when one exists (not bundled). */
  upstreamPath: string | null
}

/** A primer system design solution, used for the final comparison of a Design Exercise. */
export interface ReferenceSolution {
  /** Upstream folder name, for example `pastebin`. */
  id: string
  title: string
  /** Markdown between the title and the first step. */
  problemStatement: string
  /** `### Use cases` block of Step 1. */
  useCases: string
  /** `### Constraints and assumptions` block of Step 1. */
  constraints: string
  steps: SolutionStep[]
  /** Full raw Markdown of the solution. */
  markdown: string
  diagrams: DiagramRef[]
  /** Diagram image files in the solution folder upstream (not bundled). */
  diagramFiles: string[]
  /** Code files in the solution folder upstream (not bundled; the README inlines the snippets). */
  codeFiles: string[]
  source: SourceRef
}

export interface CorpusMetadata {
  schemaVersion: number
  repository: string
  repositoryUrl: string
  commitSha: string
  fetchedAt: string
  generator: string
  files: string[]
  license: {
    name: string
    spdx: string
    url: string
    /** The primer's own License section, verbatim. */
    upstreamNotice: string
  }
  attribution: string
  modifications: string
  thirdPartyContent: string
  excludedSections: string[]
}

export interface CorpusData {
  metadata: CorpusMetadata
  topics: CorpusTopic[]
  referenceSolutions: ReferenceSolution[]
}
