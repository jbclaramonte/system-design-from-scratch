// Pure helpers behind Mermaid Diagram rendering: fence detection for streamed Markdown, the
// source checks run before a source reaches mermaid, the render plan and memo keys. No DOM, no
// mermaid import, so they run in the unit tests. See docs/Mermaid Diagrams.md.

/** Diagram types drawn by the app (first keyword of the source). Every other type falls back. */
export const SUPPORTED_DIAGRAM_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram'
] as const

export type DiagramType = (typeof SUPPORTED_DIAGRAM_TYPES)[number]

/** Limits checked before rendering (mermaid's own `maxTextSize` and `maxEdges` back them up). */
export const DIAGRAM_LIMITS = {
  /** Characters of the whole source. */
  maxChars: 4000,
  /** Statements: non-empty, non-comment lines, `;` separated statements counted apart. */
  maxStatements: 80,
  /** Distinct nodes of a flowchart, distinct participants of a sequence diagram. */
  maxNodes: 40,
  /** Passed to mermaid as `maxEdges`. */
  maxEdges: 120
} as const

export type DiagramErrorCode =
  | 'too_large'
  | 'too_many_nodes'
  | 'forbidden_content'
  | 'unsupported_type'
  | 'parse_error'
  | 'render_error'
  | 'timeout'

export interface DiagramError {
  code: DiagramErrorCode
  /** Short English explanation, shown under "This diagram could not be drawn". */
  message: string
}

/** Payload of `onDiagramError`: callers can offer a regeneration of the content. */
export interface DiagramErrorEvent {
  source: string
  error: DiagramError
}

const FENCE_OPEN = /^[\s>]*(`{3,}|~{3,})/

/**
 * Whether a fenced code block, given as its raw Markdown (from the opening fence to the end of
 * the block), has its closing fence. An unclosed fence runs to the end of the document: while
 * a lesson streams, that is a block still being written. Blockquote and list prefixes are
 * ignored. Indented code (no fence) counts as closed.
 */
export function isFenceClosed(raw: string): boolean {
  const lines = raw.replace(/\s+$/, '').split('\n')
  const open = FENCE_OPEN.exec(lines[0] ?? '')
  if (!open) return true
  if (lines.length < 2) return false
  const fence = open[1]!
  const last = lines[lines.length - 1]!.replace(/^[\s>]*/, '')
  return last.length >= fence.length && [...last].every((char) => char === fence[0])
}

/** One fenced block of a Markdown text, as `findFences` reports it. */
export interface Fence {
  /** Info string word, lower-cased (`mermaid`, `js`), or empty. */
  lang: string
  /** Code between the fences. */
  content: string
  closed: boolean
}

/**
 * Top-level fenced blocks of a Markdown text (not those nested in lists or quotes), in order.
 * Used by the tests and the dev screen to reason about streamed text; rendering itself reads
 * the parser's positions (`isFenceClosed`).
 */
export function findFences(markdown: string): Fence[] {
  const fences: Fence[] = []
  let current: { marker: string; lang: string; lines: string[] } | null = null
  for (const line of markdown.split('\n')) {
    if (current) {
      const trimmed = line.trim()
      if (
        trimmed.length >= current.marker.length &&
        [...trimmed].every((char) => char === current!.marker[0])
      ) {
        fences.push({ lang: current.lang, content: current.lines.join('\n'), closed: true })
        current = null
      } else {
        current.lines.push(line)
      }
      continue
    }
    const open = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line)
    if (open) current = { marker: open[1]!, lang: open[2]!.toLowerCase(), lines: [] }
  }
  if (current) fences.push({ lang: current.lang, content: current.lines.join('\n'), closed: false })
  return fences
}

/** True for the info string of a Mermaid block (`mermaid`, any case). */
export const isMermaidLang = (lang: string | null | undefined): boolean =>
  lang?.trim().toLowerCase() === 'mermaid'

/**
 * How the Markdown renderer shows a fenced block. `pending`: the opening line of a block that
 * may still become a ```mermaid block (`\`\`\``, `\`\`\`mer`) is streaming, show nothing yet
 * rather than a code block that turns into a diagram a moment later.
 */
export function codeBlockKind(
  lang: string,
  content: string,
  { fenceClosed, streaming }: { fenceClosed: boolean; streaming: boolean }
): 'code' | 'diagram' | 'pending' {
  if (isMermaidLang(lang)) return 'diagram'
  const opening =
    streaming && !fenceClosed && !content.trim() && 'mermaid'.startsWith(lang.trim().toLowerCase())
  return opening ? 'pending' : 'code'
}

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/

/** Splits an optional YAML front matter from the diagram body. */
function splitFrontMatter(source: string): { frontMatter: string | null; body: string } {
  const match = FRONT_MATTER.exec(source)
  return match
    ? { frontMatter: match[1]!, body: source.slice(match[0].length) }
    : { frontMatter: null, body: source }
}

/** Statements of a diagram body: trimmed lines split on `;`, without blanks and `%%` comments. */
function statements(body: string): string[] {
  return body
    .split('\n')
    .flatMap((line) => line.split(';'))
    .map((statement) => statement.trim())
    .filter((statement) => statement && !statement.startsWith('%%'))
}

/** Diagram type keyword of a source (`flowchart`, `pie`...), or null when empty. */
export function diagramTypeOf(source: string): string | null {
  const first = statements(splitFrontMatter(source.trim()).body)[0]
  return first ? (first.split(/\s/)[0] ?? null) : null
}

const isSupportedType = (type: string | null): type is DiagramType =>
  (SUPPORTED_DIAGRAM_TYPES as readonly string[]).includes(type ?? '')

/** Title from `accTitle:` or a front matter `title:`, used for the aria-label. */
export function diagramTitleOf(source: string): string | null {
  const { frontMatter, body } = splitFrontMatter(source.trim())
  const accTitle = /^\s*accTitle\s*:\s*(.+)$/m.exec(body)?.[1]
  const title = accTitle ?? (frontMatter && /^title\s*:\s*(.+)$/m.exec(frontMatter)?.[1])
  return title ? title.trim().replace(/^["']|["']$/g, '') || null : null
}

const FLOWCHART_KEYWORDS = new Set([
  'flowchart',
  'graph',
  'subgraph',
  'end',
  'direction',
  'style',
  'classDef',
  'class',
  'linkStyle',
  'accTitle',
  'accDescr'
])

/** Flowchart link operators (`-->`, `---`, `-.->`, `==>`, `--o`, `<-->`, with `|label|`). */
const FLOWCHART_LINK = /\s*<?(?:-{2,}|={2,}|-\.+-?|~{3})[->ox]?(?:\|[^|]*\|)?\s*/
const NODE_ID = /^([A-Za-z0-9_][\w-]*)/

/** Distinct node ids of a flowchart, approximated from the start of each linked part. */
function flowchartNodes(body: string[]): Set<string> {
  const nodes = new Set<string>()
  for (const statement of body) {
    const keyword = statement.split(/[\s:]/)[0] ?? ''
    if (FLOWCHART_KEYWORDS.has(keyword)) continue
    for (const part of statement.split(FLOWCHART_LINK)) {
      for (const node of part.split('&')) {
        const id = NODE_ID.exec(node.trim())?.[1]
        if (id) nodes.add(id)
      }
    }
  }
  return nodes
}

const SEQUENCE_MESSAGE = /^([^\s:<>-][^:<>]*?)\s*(?:<<)?-{1,2}(?:>>|>|x|\))\s*[+-]?\s*([^:]+?)\s*:/
const SEQUENCE_PARTICIPANT = /^(?:participant|actor)\s+(\S+)/

/** Distinct participants of a sequence diagram (declared or used in a message). */
function sequenceParticipants(body: string[]): Set<string> {
  const participants = new Set<string>()
  for (const statement of body) {
    const declared = SEQUENCE_PARTICIPANT.exec(statement)?.[1]
    if (declared) participants.add(declared)
    const message = SEQUENCE_MESSAGE.exec(statement)
    if (message) {
      participants.add(message[1]!.trim())
      participants.add(message[2]!.trim())
    }
  }
  return participants
}

/** Node count used by the limit: flowchart nodes, sequence participants, else 0 (not counted). */
export function diagramNodeCount(source: string): number {
  const type = diagramTypeOf(source)
  const body = statements(splitFrontMatter(source.trim()).body).slice(1)
  if (type === 'flowchart' || type === 'graph') return flowchartNodes(body).size
  if (type === 'sequenceDiagram') return sequenceParticipants(body).size
  return 0
}

/** Raw HTML tags (`<b>`, `<br/>`, `</div>`), not class annotations such as `<<interface>>`. */
const HTML_TAG = /(?<!<)<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>(?!>)/i

/** Checks run before a source reaches mermaid; the first failing one wins. */
export function checkDiagramSource(
  source: string
): { ok: true; type: DiagramType } | { ok: false; error: DiagramError } {
  const fail = (code: DiagramErrorCode, message: string) =>
    ({ ok: false, error: { code, message } }) as const

  const trimmed = source.trim()
  if (!trimmed) return fail('parse_error', 'The diagram is empty.')
  if (trimmed.length > DIAGRAM_LIMITS.maxChars) {
    return fail('too_large', `The diagram is longer than ${DIAGRAM_LIMITS.maxChars} characters.`)
  }
  if (/<script/i.test(trimmed)) return fail('forbidden_content', 'The diagram contains a script.')
  if (/javascript\s*:/i.test(trimmed)) {
    return fail('forbidden_content', 'The diagram contains a javascript: link.')
  }
  if (HTML_TAG.test(trimmed)) return fail('forbidden_content', 'The diagram contains HTML tags.')
  if (/%%\s*\{/.test(trimmed)) {
    return fail('forbidden_content', 'The diagram contains a configuration directive.')
  }
  const { frontMatter, body } = splitFrontMatter(trimmed)
  if (frontMatter !== null && !/^\s*(?:title\s*:.*)?$/.test(frontMatter)) {
    return fail('forbidden_content', 'The diagram front matter may only set a title.')
  }
  const lines = statements(body)
  if (lines.some((statement) => /^click\s/i.test(statement))) {
    return fail('forbidden_content', 'The diagram contains click interactions.')
  }
  const type = diagramTypeOf(trimmed)
  if (!isSupportedType(type)) {
    return fail('unsupported_type', `Diagram type "${type ?? ''}" is not supported.`)
  }
  if (lines.length > DIAGRAM_LIMITS.maxStatements) {
    return fail('too_large', `The diagram has more than ${DIAGRAM_LIMITS.maxStatements} lines.`)
  }
  if (diagramNodeCount(trimmed) > DIAGRAM_LIMITS.maxNodes) {
    return fail('too_many_nodes', `The diagram has more than ${DIAGRAM_LIMITS.maxNodes} nodes.`)
  }
  return { ok: true, type }
}

/** Source as rendered and keyed: line endings and trailing spaces normalized, trimmed. */
export function normalizeDiagramSource(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

/**
 * Memo key of a source: FNV-1a hash of the normalized source plus its length. The same key
 * means the same drawing, so the render cache and the deterministic SVG ids use it.
 */
export function diagramKey(source: string): string {
  const normalized = normalizeDiagramSource(source)
  let hash = 0x811c9dc5
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${normalized.length.toString(16)}`
}

export type DiagramPlan =
  /** The fence is still streaming: show the placeholder, do not parse. */
  | { kind: 'loading' }
  | { kind: 'render'; source: string; key: string; type: DiagramType; title: string | null }
  | { kind: 'fallback'; source: string; key: string; error: DiagramError }

/**
 * What to show for a diagram source. `fenceClosed: false` with `streaming: true` waits; an
 * unclosed fence once the stream has ended is drawn as is (the content is final).
 */
export function planDiagram(
  source: string,
  { fenceClosed = true, streaming = false }: { fenceClosed?: boolean; streaming?: boolean } = {}
): DiagramPlan {
  if (!fenceClosed && streaming) return { kind: 'loading' }
  const normalized = normalizeDiagramSource(source)
  const key = diagramKey(normalized)
  const check = checkDiagramSource(normalized)
  if (!check.ok) return { kind: 'fallback', source: normalized, key, error: check.error }
  return {
    kind: 'render',
    source: normalized,
    key,
    type: check.type,
    title: diagramTitleOf(normalized)
  }
}

/** Accessible name of a drawn diagram: the given title, the source's title, or a generic one. */
export function diagramLabel(type: DiagramType, title?: string | null): string {
  if (title?.trim()) return `Diagram: ${title.trim()}`
  const names: Record<DiagramType, string> = {
    flowchart: 'flowchart',
    graph: 'flowchart',
    sequenceDiagram: 'sequence diagram',
    classDiagram: 'class diagram',
    stateDiagram: 'state diagram',
    'stateDiagram-v2': 'state diagram',
    erDiagram: 'entity relationship diagram'
  }
  return `Diagram (${names[type]}), source below`
}

/** Error raised by mermaid, reduced to its first line (and a parse error's expectation). */
export function diagramErrorFromException(
  code: 'parse_error' | 'render_error' | 'timeout',
  reason: unknown
): DiagramError {
  const text = reason instanceof Error ? reason.message : String(reason)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-^\s]*$/.test(line))
  const first = lines[0] ?? 'Unknown error.'
  // Parse errors end with the expectation ("Expecting 'SQE', ... got 'PS'"): keep it.
  const last = lines.length > 1 ? lines[lines.length - 1]! : null
  const message = last && /^Expecting|got /.test(last) ? `${first} ${last}` : first
  return { code, message: message.length > 200 ? `${message.slice(0, 199)}…` : message }
}

/**
 * Smallest width (px) a drawn diagram may shrink to: 70 % of its natural width (SVG viewBox).
 * Below that the container scrolls horizontally instead of making the text unreadable.
 */
export function svgMinWidth(svg: string): number | null {
  const viewBox = /viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+[\d.]+"/.exec(svg)?.[1]
  const width = viewBox ? Number(viewBox) : NaN
  return Number.isFinite(width) && width > 0 ? Math.round(width * 0.7) : null
}

/** Rewrites the render id of a cached SVG to the id of one diagram instance on the page. */
export function withSvgId(svg: string, renderId: string, instanceId: string): string {
  return renderId === instanceId ? svg : svg.split(renderId).join(instanceId)
}

/** Makes a React `useId` value usable in an SVG id and a CSS selector. */
export const cssSafeId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '')

const warned = new Set<string>()

/** `console.warn` once per distinct failure (same source key and error code). */
export function warnDiagramOnce(
  key: string,
  error: DiagramError,
  warn: (...args: unknown[]) => void = console.warn
): boolean {
  const id = `${key}:${error.code}`
  if (warned.has(id)) return false
  warned.add(id)
  warn(`[diagram] ${error.code}: ${error.message}`)
  return true
}
