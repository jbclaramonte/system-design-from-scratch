// Lesson prompt: streamed French Markdown on a topic, one section per notion of its Notion
// Outline, grounded on the topic's excerpts (ungrounded in the Foundations Module).
import {
  assembleExcerpts,
  AUDIENCE_RULES,
  DIAGRAM_RULES,
  diagramPlacementRules,
  excerptSection,
  groundingRules,
  joinParts,
  LANGUAGE_RULES,
  notionList,
  type GroundingInput,
  type NotionBrief,
  type PromptBuild,
  type TopicBrief
} from './common'
import { repairDiagrams } from '../diagrams'

/** Bump with any change to the prompt below. */
export const LESSON_PROMPT_VERSION = 'lesson-4'

export const LESSON_EXCERPT_TOKENS = 8000

/** Heading of the closing recap section, one bullet per notion. */
export const RECAP_HEADING = 'Récapitulatif'

/** `<!-- notion: <slug> -->`: marks the section of a notion in a lesson (hidden when rendered). */
export const notionMarker = (slug: string) => `<!-- notion: ${slug} -->`

const NOTION_MARKER_PATTERN = /<!--\s*notion:\s*([a-z0-9-]+)\s*-->/g

/** Notion slugs marked in a lesson, in order. */
export function findNotionMarkers(markdown: string): string[] {
  return [...markdown.matchAll(NOTION_MARKER_PATTERN)].map((match) => match[1]!)
}

const SYSTEM = `You are a patient system design tutor writing a lesson for a desktop learning app.

${LANGUAGE_RULES}

${AUDIENCE_RULES}

${DIAGRAM_RULES}

Output only the lesson, in Markdown: no preamble, no closing remark, no code fence around it.`

export function buildLessonGeneration(
  topic: TopicBrief,
  notions: readonly NotionBrief[],
  grounding: GroundingInput
): PromptBuild<string> {
  const block = assembleExcerpts(grounding.excerpts, LESSON_EXCERPT_TOKENS)
  const user = joinParts(
    `Write the lesson on the topic "${topic.title}" (id \`${topic.slug}\`).`,
    `Notions to teach, in this order (one section each):\n${notionList(notions)}`,
    `Structure, to follow exactly:
1. \`# <topic title in French>\`, then an introduction of 3 to 5 sentences: which problem this topic solves, with an everyday analogy.
2. For each notion, in the order above: a \`## <notion title>\` heading, then the marker line \`${notionMarker('<slug>')}\` with the notion slug, then the explanation: what it is, how it works step by step, when to use it, and its main drawback or trade-off. Short paragraphs, bullet lists, and a small concrete example (a request flow, an online shop, numbers) when it helps.
3. A last \`## ${RECAP_HEADING}\` section with exactly one bullet per notion, in order: \`- **<notion title>** : <one sentence to remember>\`.

Length: about 150 to 250 words per notion. Use **bold** for key terms; no tables; no images other than the Mermaid diagrams.`,
    diagramPlacementRules({
      min: 1,
      max: 3,
      when: 'in the whole lesson, where the explanation needs a picture: an architecture, a request flow, a data flow or a failure scenario'
    }),
    groundingRules(block.sectionIds),
    excerptSection(block)
  )
  return {
    kind: 'lesson',
    input: {
      topic: topic.slug,
      title: topic.title,
      notions: notions.map(({ slug, title }) => ({ slug, title })),
      sectionIds: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: LESSON_PROMPT_VERSION, system: SYSTEM, user },
    groundedSourceSections: block.sectionIds,
    finalize: repairDiagrams
  }
}
