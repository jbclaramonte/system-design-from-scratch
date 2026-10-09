// Building blocks shared by the lesson, remediation lesson, quiz and Notion Outline prompts:
// language and audience rules, Grounding rules, citation format and the excerpt block.
import type { z } from 'zod'
import type { GenerationKind, Json } from '../../../shared/generation'
import { fitExcerptsToBudget, type Excerpt } from '../../corpus/lookup'
import type { GenerationPrompt } from '../service'

/** What a prompt builder returns: everything `GenerationService.generate` needs but scheduling. */
export interface PromptBuild<T extends Json = Json> {
  kind: GenerationKind
  /** Part of the Content Cache key: everything the output depends on, besides the prompt text. */
  input: Json
  prompt: GenerationPrompt
  schema?: z.ZodType<T>
  /** Section ids of the excerpts actually in the prompt. Empty: ungrounded. */
  groundedSourceSections: string[]
}

/** What a builder needs to know about the topic. */
export interface TopicBrief {
  slug: string
  title: string
  /** Foundations Module topics are generated ungrounded. */
  inFoundationsModule: boolean
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

export const LANGUAGE_RULES = `Language:
- Write everything the learner reads in French, natural and simple, addressing the learner as "tu".
- Keep system design technical terms in English, exactly as they are said in interviews (cache, load balancer, sharding, cache-aside, write-through, latency, throughput, TTL, database...). Never translate them; the first time one appears you may add a short French gloss in parentheses.
- Do not mix in English sentences.`

export const AUDIENCE_RULES = `Audience: a complete beginner in system design who knows basic programming. Define every technical term the first time it appears, prefer short sentences, and give one concrete example for each abstract idea.`

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

export function groundingRules(sectionIds: readonly string[]): string {
  if (sectionIds.length === 0) {
    return `Grounding: this content belongs to the Foundations Module, outside the System Design Primer. There are no source excerpts: write from well-established general knowledge only, stay at the level of widely taught basics, and do not write any [source: ...] citation.`
  }
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
