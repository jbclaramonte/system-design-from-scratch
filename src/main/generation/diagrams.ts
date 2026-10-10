// Mermaid Diagrams of generated Markdown (lessons, Remediation Lessons, Protocol Step Lessons):
// validation of every ```mermaid block once the text is final (the renderer's checks, then
// mermaid's own parser), and one repair Generation for the blocks that fail. The renderer stays
// the second line of defence (it falls back to a code block). See docs/Mermaid Diagrams.md and
// docs/Prompts.md.
import { z } from 'zod'
import type { Json } from '../../shared/generation'
import {
  checkDiagramSource,
  DIAGRAM_LIMITS,
  diagramErrorFromException,
  isMermaidLang,
  normalizeDiagramSource,
  type DiagramError,
  type DiagramErrorCode
} from '../../shared/diagramSource'
import { DIAGRAM_RULES } from './prompts/common'
import type { MermaidParse } from './mermaidParser'
import type { ContentFinalizer, FinalizeCall, FinalizeTools } from './service'

/** Bump with any change to the repair prompt below. Not part of any Content Cache key. */
export const DIAGRAM_REPAIR_PROMPT_VERSION = 'diagram-repair-2'

const DIAGRAM_REPAIR_TIMEOUT_MS = 90_000

/** Longest wait for mermaid's parser on one source. */
export const DIAGRAM_PARSE_TIMEOUT_MS = 5_000

export type { MermaidParse }

export interface DiagramParseOptions {
  /** Defaults to mermaid's own parser; tests inject one. */
  parse?: MermaidParse
  timeoutMs?: number
}

export type DiagramParseResult =
  | { ok: true }
  | { ok: false; code: DiagramErrorCode; /** Short English explanation. */ error: string }

let mermaidParser: Promise<MermaidParse | null> | undefined

/** mermaid is loaded on first use, in its own chunk of the main bundle (`mermaidParser.ts`). */
function loadMermaidParser(): Promise<MermaidParse | null> {
  mermaidParser ??= import('./mermaidParser').then(
    (module) =>
      module.loadMermaidParser({
        maxTextSize: DIAGRAM_LIMITS.maxChars,
        maxEdges: DIAGRAM_LIMITS.maxEdges
      }),
    (error: unknown) => {
      console.error('Mermaid parser unavailable: diagrams are only checked statically', error)
      return null
    }
  )
  return mermaidParser
}

async function parseOnce(
  source: string,
  { parse, timeoutMs = DIAGRAM_PARSE_TIMEOUT_MS }: DiagramParseOptions
): Promise<DiagramParseResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const parser = parse ?? (await loadMermaidParser())
    if (!parser) return { ok: true }
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    const parsed = Promise.resolve()
      .then(() => parser(source))
      .then(() => 'parsed' as const)
    if ((await Promise.race([parsed, timeout])) === 'timeout') {
      parsed.catch(() => {})
      return { ok: false, code: 'timeout', error: `Parsing took longer than ${timeoutMs} ms.` }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: 'parse_error',
      error: diagramErrorFromException('parse_error', error).message
    }
  } finally {
    clearTimeout(timer)
  }
}

/** mermaid keeps global parser state: one parse at a time. */
let parseQueue: Promise<unknown> = Promise.resolve()

/**
 * Validates a Mermaid source like the renderer: `checkDiagramSource` first, then mermaid's own
 * parser (bad syntax such as unquoted parentheses in a flowchart label), one call at a time,
 * with a timeout. Never throws.
 */
export function parseDiagramSource(
  source: string,
  options: DiagramParseOptions = {}
): Promise<DiagramParseResult> {
  const normalized = normalizeDiagramSource(source)
  const check = checkDiagramSource(normalized)
  if (!check.ok) {
    return Promise.resolve({ ok: false, code: check.error.code, error: check.error.message })
  }
  const run = parseQueue.then(() => parseOnce(normalized, options))
  parseQueue = run
  return run
}

/** A top-level ```mermaid block of a Markdown text, with its line range. */
export interface MermaidBlock {
  /** 1-based position among the Mermaid blocks of the text. */
  index: number
  source: string
  /** Line of the opening fence (0-based). */
  startLine: number
  /** Line of the closing fence, or the last line of the text when the fence is not closed. */
  endLine: number
  /** The opening fence characters (```` ``` ````, `~~~`...). */
  marker: string
  closed: boolean
}

/** Top-level ```mermaid blocks of a Markdown text, in order (same fence rules as `findFences`). */
export function findMermaidBlocks(markdown: string): MermaidBlock[] {
  const lines = markdown.split('\n')
  const blocks: MermaidBlock[] = []
  let open: { marker: string; lang: string; startLine: number } | null = null
  const push = (endLine: number, closed: boolean) => {
    if (!open || !isMermaidLang(open.lang)) return
    blocks.push({
      index: blocks.length + 1,
      source: lines.slice(open.startLine + 1, closed ? endLine : endLine + 1).join('\n'),
      startLine: open.startLine,
      endLine,
      marker: open.marker,
      closed
    })
  }
  lines.forEach((line, lineIndex) => {
    if (open) {
      const trimmed = line.trim()
      if (
        trimmed.length >= open.marker.length &&
        [...trimmed].every((char) => char === open!.marker[0])
      ) {
        push(lineIndex, true)
        open = null
      }
      return
    }
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(line)
    if (fence) open = { marker: fence[1]!, lang: fence[2]!, startLine: lineIndex }
  })
  if (open) push(lines.length - 1, false)
  return blocks
}

export interface InvalidDiagram {
  index: number
  source: string
  error: DiagramError
  /** The paragraph right before the block (its lead-in), for the repair prompt. */
  context: string
}

export interface DiagramValidation {
  /** Number of Mermaid blocks. */
  blocks: number
  invalid: InvalidDiagram[]
}

/** The paragraph before a line, without headings, comments or fences; at most 400 characters. */
function paragraphBefore(lines: readonly string[], line: number): string {
  const paragraph: string[] = []
  for (let index = line - 1; index >= 0; index--) {
    const text = lines[index]!.trim()
    if (!text) {
      if (paragraph.length > 0) break
      continue
    }
    if (/^(#|<!--|```|~~~)/.test(text)) break
    paragraph.unshift(text)
  }
  const joined = paragraph.join(' ')
  return joined.length > 400 ? `…${joined.slice(-399)}` : joined
}

/**
 * Runs `parseDiagramSource` on every Mermaid block of a final text (a streamed text that has
 * ended: an unclosed fence is checked as it is, like the renderer draws it).
 */
export async function validateDiagramsInMarkdown(
  markdown: string,
  options: DiagramParseOptions = {}
): Promise<DiagramValidation> {
  const lines = markdown.split('\n')
  const blocks = findMermaidBlocks(markdown)
  const invalid: InvalidDiagram[] = []
  for (const block of blocks) {
    const result = await parseDiagramSource(block.source, options)
    if (result.ok) continue
    invalid.push({
      index: block.index,
      source: block.source,
      error: { code: result.code, message: result.error },
      context: paragraphBefore(lines, block.startLine)
    })
  }
  return { blocks: blocks.length, invalid }
}

/** `<!-- diagram-invalid: <block index> <error code> -->`, appended for a block left invalid. */
export const diagramFailureMarker = (index: number, code: DiagramErrorCode) =>
  `<!-- diagram-invalid: ${index} ${code} -->`

const FAILURE_MARKER_PATTERN = /<!--\s*diagram-invalid:\s*(\d+)\s+([a-z_]+)\s*-->/g

/**
 * Blocks a stored text records as still invalid after the repair, so a regeneration can be
 * offered. Hidden when rendered (raw HTML is skipped).
 */
export function findDiagramFailures(markdown: string): { index: number; code: string }[] {
  return [...markdown.matchAll(FAILURE_MARKER_PATTERN)].map((match) => ({
    index: Number(match[1]),
    code: match[2]!
  }))
}

export const diagramRepairSchema = z.object({
  diagrams: z
    .array(
      z.object({
        id: z.number().int().min(1),
        source: z.string().min(1).max(DIAGRAM_LIMITS.maxChars)
      })
    )
    .min(1)
})

export type DiagramRepair = z.infer<typeof diagramRepairSchema>

const REPAIR_SYSTEM = `You fix Mermaid diagrams written for a French system design course, so that a strict renderer can draw them. You return corrected diagram sources only.

${DIAGRAM_RULES}`

/** The repair Generation of a text's invalid blocks: one call for all of them. */
export function buildDiagramRepairCall(
  invalid: readonly InvalidDiagram[]
): FinalizeCall<DiagramRepair> {
  const diagrams = invalid
    .map(
      (diagram) =>
        `<diagram id="${diagram.index}">\nError: ${diagram.error.code} (${diagram.error.message})\nIntroduced by: ${diagram.context || '(no lead-in)'}\nSource:\n${diagram.source}\n</diagram>`
    )
    .join('\n\n')
  const user = `These Mermaid diagrams of a lesson failed the renderer's checks or mermaid's parser (the error says which). Fix each one so it follows the diagram rules and parses.
- Keep what the diagram shows: the same components, arrows and meaning, in the same language. Change only what makes it invalid (fix the syntax the parse error points at, wrap labels with parentheses or punctuation in double quotes, remove HTML, styling, configuration or click lines, shorten it, or redraw an unsupported type as a flowchart or a sequenceDiagram).
- Return one entry per diagram, with its id, and the corrected source without the \`\`\`mermaid fence.

${diagrams}`
  return {
    prompt: { version: DIAGRAM_REPAIR_PROMPT_VERSION, system: REPAIR_SYSTEM, user },
    schema: diagramRepairSchema,
    timeoutMs: DIAGRAM_REPAIR_TIMEOUT_MS
  }
}

/** A repaired source as the model may return it: with or without its fence. */
function unfence(source: string): string {
  const fenced = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\s*\1\s*$/.exec(source)
  return (fenced ? fenced[2]! : source).trim()
}

/**
 * Validates every Mermaid block of a final Markdown text. When some fail, runs ONE repair
 * Generation for all of them and swaps in each corrected source that passes the checks; a
 * block still invalid is kept as it is (the renderer falls back to a code block) and recorded
 * with a `diagramFailureMarker` at the end of the text.
 */
export async function repairDiagramsInMarkdown(
  markdown: string,
  tools: FinalizeTools,
  options: DiagramParseOptions = {}
): Promise<string> {
  const { invalid } = await validateDiagramsInMarkdown(markdown, options)
  if (invalid.length === 0) return markdown

  const repair = await tools.complete(buildDiagramRepairCall(invalid))
  const fixed = new Map<number, string>()
  for (const diagram of repair?.diagrams ?? []) {
    const source = unfence(diagram.source)
    if (
      invalid.some((entry) => entry.index === diagram.id) &&
      !fixed.has(diagram.id) &&
      (await parseDiagramSource(source, options)).ok
    ) {
      fixed.set(diagram.id, source)
    }
  }

  const lines = markdown.split('\n')
  const blocks = findMermaidBlocks(markdown)
  for (const block of [...blocks].reverse()) {
    const source = fixed.get(block.index)
    if (source === undefined) continue
    const opening = lines[block.startLine]!
    lines.splice(
      block.startLine,
      block.endLine - block.startLine + 1,
      opening,
      ...source.split('\n'),
      block.marker
    )
  }
  const failures = invalid
    .filter((diagram) => !fixed.has(diagram.index))
    .map((diagram) => diagramFailureMarker(diagram.index, diagram.error.code))
  const repaired = lines.join('\n')
  return failures.length > 0 ? `${repaired.trimEnd()}\n\n${failures.join('\n')}\n` : repaired
}

/** `finalize` hook of the lesson-like prompts: diagram repair of a Markdown output. */
export const repairDiagrams: ContentFinalizer = async (content: Json, tools: FinalizeTools) =>
  typeof content === 'string' ? repairDiagramsInMarkdown(content, tools) : content

/**
 * `finalize` hook of the quiz: a question's `diagram` is optional, so a diagram that mermaid's
 * own parser rejects is dropped (the question stays playable) rather than repaired or shown as
 * broken code. The schema already ran the light checks (`checkDiagramSource`, answer leaks).
 */
export const dropUnparsableQuizDiagrams: ContentFinalizer = async (content: Json) => {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return content
  const questions = (content as { questions?: Json }).questions
  if (!Array.isArray(questions)) return content
  const checked: Json[] = []
  for (const question of questions) {
    if (
      typeof question === 'object' &&
      question !== null &&
      !Array.isArray(question) &&
      typeof question.diagram === 'string'
    ) {
      const result = await parseDiagramSource(question.diagram)
      if (!result.ok) {
        const rest = { ...question }
        delete rest.diagram
        checked.push(rest)
        continue
      }
    }
    checked.push(question)
  }
  return { ...content, questions: checked }
}
