// Lesson prompt: streamed Markdown on a topic, one section per notion of its Notion
// Outline, grounded on the topic's excerpts (ungrounded in the Foundations Module).
import type { GenerationLanguage } from '../../../shared/generationLanguage'
import { languageProfile } from '../languageProfile'
import {
  assembleExcerpts,
  AUDIENCE_RULES,
  diagramPlacementRules,
  diagramRules,
  excerptSection,
  groundingRules,
  joinParts,
  languageRules,
  notionList,
  type GroundingInput,
  type NotionBrief,
  type PromptBuild,
  type TopicBrief
} from './common'
import { repairDiagramsFor } from '../diagrams'

/** Bump with any change to the prompt below. */
export const LESSON_PROMPT_VERSION = 'lesson-4'

export const LESSON_EXCERPT_TOKENS = 8000

/** `<!-- notion: <slug> -->`: marks the section of a notion in a lesson (hidden when rendered). */
export const notionMarker = (slug: string) => `<!-- notion: ${slug} -->`

const NOTION_MARKER_PATTERN = /<!--\s*notion:\s*([a-z0-9-]+)\s*-->/g

/** Notion slugs marked in a lesson, in order. */
export function findNotionMarkers(markdown: string): string[] {
  return [...markdown.matchAll(NOTION_MARKER_PATTERN)].map((match) => match[1]!)
}

const system = (
  language: GenerationLanguage
) => `You are a patient system design tutor writing a lesson for a desktop learning app.

${languageRules(language)}

${AUDIENCE_RULES}

${diagramRules(language)}

Output only the lesson, in Markdown: no preamble, no closing remark, no code fence around it.`

export function buildLessonGeneration(
  topic: TopicBrief,
  notions: readonly NotionBrief[],
  grounding: GroundingInput,
  language: GenerationLanguage
): PromptBuild<string> {
  const profile = languageProfile(language)
  const block = assembleExcerpts(grounding.excerpts, LESSON_EXCERPT_TOKENS)
  const user = joinParts(
    `Write the lesson on the topic "${topic.title}" (id \`${topic.slug}\`).`,
    `Notions to teach, in this order (one section each):\n${notionList(notions)}`,
    `Structure, to follow exactly:
1. \`# <topic title in ${profile.name}>\`, then an introduction of 3 to 5 sentences: which problem this topic solves, with an everyday analogy.
2. For each notion, in the order above: a \`## <notion title>\` heading, then the marker line \`${notionMarker('<slug>')}\` with the notion slug, then the explanation: what it is, how it works step by step, when to use it, and its main drawback or trade-off. Short paragraphs, bullet lists, and a small concrete example (a request flow, an online shop, numbers) when it helps.
3. A last \`## ${profile.lesson.recapHeading}\` section with exactly one bullet per notion, in order: \`- **<notion title>**${profile.lesson.recapSeparator} <one sentence to remember>\`.

Length: about 150 to 250 words per notion. Use **bold** for key terms; no tables; no images other than the Mermaid diagrams.`,
    diagramPlacementRules({
      min: 1,
      max: 3,
      when: 'in the whole lesson, where the explanation needs a picture: an architecture, a request flow, a data flow or a failure scenario'
    }),
    groundingRules(block.sectionIds, language),
    excerptSection(block)
  )
  return {
    kind: 'lesson',
    language,
    input: {
      topic: topic.slug,
      title: topic.title,
      notions: notions.map(({ slug, title }) => ({ slug, title })),
      sectionIds: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: LESSON_PROMPT_VERSION, system: system(language), user },
    groundedSourceSections: block.sectionIds,
    finalize: repairDiagramsFor(language)
  }
}
