// Building blocks shared by the lesson, remediation lesson, quiz and Notion Outline prompts:
// language and audience rules, Grounding rules, citation format and the excerpt block.
import type { z } from 'zod'
import type { GenerationKind, Json } from '../../../shared/generation'
import type { GenerationLanguage } from '../../../shared/generationLanguage'
import { fitExcerptsToBudget, type Excerpt } from '../../corpus/lookup'
import { languageProfile } from '../languageProfile'
import type { ContentFinalizer, GenerationPrompt } from '../service'

/** What a prompt builder returns: everything `GenerationService.generate` needs but scheduling. */
export interface PromptBuild<T extends Json = Json> {
  kind: GenerationKind
  /** Language the content is written in: part of the Content Cache key (cached kinds). */
  language: GenerationLanguage
  /** Part of the Content Cache key: everything the output depends on, besides the prompt text. */
  input: Json
  prompt: GenerationPrompt
  schema?: z.ZodType<T>
  /** Section ids of the excerpts actually in the prompt. Empty: ungrounded. */
  groundedSourceSections: string[]
  /** Post-processing of the output before it is stored (the Mermaid Diagram repair). */
  finalize?: ContentFinalizer
}

/** What a builder needs to know about the topic. */
export interface TopicBrief {
  slug: string
  title: string
  /** Foundations Module topics are generated ungrounded. */
  inFoundationsModule: boolean
  /** Foundations Module: what the topic covers, which steers its Notion Outline. */
  scope?: string
  /** Foundations Module: what it leaves to the grounded primer topics. */
  leftToPrimer?: string
}

/** A notion as passed to the prompts (a row of the topic's Notion Outline). */
export interface NotionBrief {
  slug: string
  title: string
  description: string | null
  sourceSections: string[]
}

/**
 * Grounding material of a prompt. `excerpts` empty means ungrounded (Foundations Module).
 * `corpusVersion` (the primer commit) goes into the cache key: new excerpts, new content.
 */
export interface GroundingInput {
  excerpts: Excerpt[]
  corpusVersion: string
}

/**
 * The output rules of the Generation Language: address form, jargon policy, everyday-word policy
 * (from its language profile). Every prompt includes it verbatim (tested), so changing a profile
 * means bumping every prompt version that includes it.
 */
export const languageRules = (language: GenerationLanguage): string =>
  languageProfile(language).languageRules

export const AUDIENCE_RULES = `Audience: a complete beginner in system design who knows basic programming. Define every technical term the first time it appears, prefer short sentences, and give one concrete example for each abstract idea.`

/**
 * How to write a Mermaid Diagram the app can draw (see docs/Mermaid Diagrams.md): supported
 * types, plain-text labels, size, and grounding. Shared by every prompt that may ask for a
 * diagram; where and how many is up to the prompt (`diagramPlacementRules` for lessons). The
 * label language and the examples come from the language profile. Changing it means bumping the
 * version of every prompt that includes it.
 */
export function diagramRules(language: GenerationLanguage): string {
  const { diagram } = languageProfile(language)
  return `Diagrams (Mermaid):
- Write each diagram as a fenced block that starts with \`\`\`mermaid on its own line and ends with \`\`\` on its own line.
- Use only these diagram types: flowchart (LR or TD) for an architecture or a data flow, sequenceDiagram for a request flow between components over time, stateDiagram-v2 for states and transitions, erDiagram for a data model, classDiagram only if nothing else fits. Nothing else (no pie, gantt, mindmap, timeline, journey, C4...).
- Keep it small and readable: at most about 12 nodes (or participants), one idea per diagram, short labels of 1 to 4 words. Labels follow the language rules: ${diagram.labelPolicy}.
- Plain text only: no HTML tags, no <br>, no Markdown inside labels, no emojis, no click or link lines, no %%{init}%% or other configuration, no style, classDef, class or linkStyle lines, no front matter.
- Node ids are short ASCII words (C, LB, S1, DB). Put the visible text in a label; wrap a label in double quotes when it contains punctuation, parentheses, accents next to symbols, slashes or colons, for example ${diagram.quotedLabelExample}. Never use double quotes inside a label. Avoid ; and # in any text.
- Label every arrow that carries data or a request (${diagram.arrowLabelExamples}).
- A diagram shows only what the surrounding text says, and never contradicts it. It follows the same grounding rules as the text: no component, product, number or guarantee that the text does not state.
- Valid examples:
\`\`\`mermaid
${diagram.flowchartExample}
\`\`\`
\`\`\`mermaid
${diagram.sequenceExample}
\`\`\``
}

/**
 * Where and how many diagrams a lesson-like text gets: `max` diagrams at most (`min` at
 * least), each right after the paragraph it illustrates, introduced by one sentence.
 */
export function diagramPlacementRules({
  min,
  max,
  when
}: {
  min: number
  max: number
  when: string
}): string {
  const count = min === 0 ? `at most ${max}` : min === max ? `${max}` : `${min} to ${max}`
  return `Diagram placement: include ${count} Mermaid diagram${max > 1 ? 's' : ''} ${when}. Put each one right after the paragraph it illustrates, introduced by one sentence that says what to look at. A diagram adds a view of the text, it never replaces the explanation.`
}

/** `[source: <section id>]`, the inline citation format of every grounded text. */
export const citation = (sectionId: string) => `[source: ${sectionId}]`

const CITATION_PATTERN = /\[source:\s*([^\]\s]+)\s*\]/g

/** Section ids cited inline with `[source: <id>]`, in order of first appearance. */
export function findCitations(markdown: string): string[] {
  const ids = new Set<string>()
  for (const match of markdown.matchAll(CITATION_PATTERN)) ids.add(match[1]!)
  return [...ids]
}

/** Cited section ids that are not in `allowed` (invented or mistyped citations). */
export function unknownCitations(markdown: string, allowed: readonly string[]): string[] {
  const known = new Set(allowed)
  return findCitations(markdown).filter((id) => !known.has(id))
}

/**
 * Ungrounded content (Foundations Module) has no excerpt to check it against: keep it to
 * textbook basics, numbers as definitions or rough orders of magnitude, no references.
 */
export function ungroundedRules(language: GenerationLanguage): string {
  const { ungrounded } = languageProfile(language)
  return `Grounding: this content belongs to the Foundations Module, outside the System Design Primer. There are no source excerpts and nobody checks your facts before the learner reads them, so be conservative:
- Write from well-established general knowledge only: the standard basics that any introductory course on networks, operating systems or databases teaches the same way. Leave out what you are not sure of, vendor-specific details, recent changes and disputed claims.
- Numbers: give exact values only for definitions and fixed conventions (1 octet = 8 bits, 2^10 = 1024, a day has 86,400 seconds, status code 404, port 443 for HTTPS). Give measured quantities (latencies, throughputs, failure rates, sizes of real systems) only as rough orders of magnitude, with ${ungrounded.approximately}, and say they depend on the hardware and change over time. Never invent a precise figure, statistic or benchmark.
- When you simplify, say so (${ungrounded.simplifying}). When the right choice depends on the situation, say what it depends on instead of stating one universal rule.
- No references of any kind: do not write any [source: ...] citation, and do not cite books, articles, studies, RFC numbers, URLs or quotes.`
}

export function groundingRules(
  sectionIds: readonly string[],
  language: GenerationLanguage
): string {
  if (sectionIds.length === 0) return ungroundedRules(language)
  return `Grounding:
- Use only the facts stated in the excerpts below. If an idea would help but is not in the excerpts, leave it out rather than inventing it. You may add everyday analogies and simple examples that illustrate a fact of the excerpts, but no new technical claims (numbers, product names, guarantees, extra strategies).
- Cite the excerpt a statement comes from inline, right after the sentence or paragraph, as ${citation('<excerpt id>')}, for example ${citation(sectionIds[0]!)}. One id per bracket, copied exactly from the excerpt list. Never cite anything else (no URLs, no other ids).`
}

/** Light cleanup of primer Markdown for a prompt: no HTML images or wrappers, no link targets. */
export function cleanExcerptMarkdown(markdown: string): string {
  return markdown
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/?(p|br|i|b|div|span)\b[^>]*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:|#)[^)]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface ExcerptBlock {
  /** Excerpts formatted for the prompt, or '' when none. */
  text: string
  /** Ids of the excerpts that made it into the block, in order. */
  sectionIds: string[]
  truncated: boolean
}

/**
 * Formats excerpts for a prompt within a token budget (about 4 characters per token). Empty
 * excerpts are skipped; excerpts are kept in order while they fit, the first one is truncated
 * if even it does not fit.
 */
export function assembleExcerpts(excerpts: Excerpt[], maxTokens: number): ExcerptBlock {
  const cleaned = excerpts
    .map((excerpt) => ({ ...excerpt, markdown: cleanExcerptMarkdown(excerpt.markdown) }))
    .filter((excerpt) => excerpt.markdown.length > 0)
  const fitted = fitExcerptsToBudget(cleaned, { maxTokens })
  const text = fitted.excerpts
    .map(
      (excerpt) =>
        `<excerpt id="${excerpt.sectionId}" title="${excerpt.breadcrumb.join(' > ')}">\n${excerpt.markdown}\n</excerpt>`
    )
    .join('\n\n')
  return {
    text,
    sectionIds: fitted.excerpts.map((excerpt) => excerpt.sectionId),
    truncated: fitted.truncated
  }
}

export function excerptSection(block: ExcerptBlock): string {
  if (block.sectionIds.length === 0) return ''
  return `Source excerpts from the System Design Primer (CC BY 4.0), the only allowed source:\n\n${block.text}`
}

export function notionList(notions: readonly NotionBrief[]): string {
  return notions
    .map((notion, index) => {
      const sources = notion.sourceSections.length
        ? ` (sources: ${notion.sourceSections.join(', ')})`
        : ''
      return `${index + 1}. \`${notion.slug}\`: ${notion.title}. ${notion.description ?? ''}${sources}`
    })
    .join('\n')
}

/** Joins prompt parts, dropping empty ones. */
export const joinParts = (...parts: (string | false | undefined)[]) =>
  parts.filter((part): part is string => Boolean(part)).join('\n\n')
