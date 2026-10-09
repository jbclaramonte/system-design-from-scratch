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
 * French course, system design jargon in English, everyday computing words in French. Every
 * prompt includes it verbatim (tested), so changing it means bumping every prompt version.
 */
export const LANGUAGE_RULES = `Language:
- Write everything the learner reads in French, natural and simple, addressing the learner as "tu".
- Keep only system design jargon in English, exactly as it is said in interviews (load balancer, sharding, cache, cache-aside, write-through, replication, throughput, latency, TTL...). Never translate it; the first time a term appears you may add a short French gloss in parentheses.
- Write everyday computing words in French, as a French developer says them: serveur, client, requête, réponse, mémoire, disque, réseau, base de données, octet (Ko, Mo, Go, To), fichier, machine, panne.
- Examples. Good: "le serveur renvoie une réponse", "la mémoire est plus rapide que le disque", "un load balancer répartit les requêtes", "10 Go par jour". Bad: "le server renvoie une response", "la memory est plus rapide que le disk", "un répartiteur de charge", "10 GB par jour".
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

/**
 * Ungrounded content (Foundations Module) has no excerpt to check it against: keep it to
 * textbook basics, numbers as definitions or rough orders of magnitude, no references.
 */
export const UNGROUNDED_RULES = `Grounding: this content belongs to the Foundations Module, outside the System Design Primer. There are no source excerpts and nobody checks your facts before the learner reads them, so be conservative:
- Write from well-established general knowledge only: the standard basics that any introductory course on networks, operating systems or databases teaches the same way. Leave out what you are not sure of, vendor-specific details, recent changes and disputed claims.
- Numbers: give exact values only for definitions and fixed conventions (1 octet = 8 bits, 2^10 = 1024, a day has 86,400 seconds, status code 404, port 443 for HTTPS). Give measured quantities (latencies, throughputs, failure rates, sizes of real systems) only as rough orders of magnitude, with "environ" or "de l'ordre de", and say they depend on the hardware and change over time. Never invent a precise figure, statistic or benchmark.
- When you simplify, say so ("en simplifiant"). When the right choice depends on the situation, say what it depends on instead of stating one universal rule.
- No references of any kind: do not write any [source: ...] citation, and do not cite books, articles, studies, RFC numbers, URLs or quotes.`

export function groundingRules(sectionIds: readonly string[]): string {
  if (sectionIds.length === 0) return UNGROUNDED_RULES
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
