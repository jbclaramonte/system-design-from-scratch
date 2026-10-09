// Notion Outline: the ordered list of notions a topic is split into, generated once per topic
// from its sub-topics and stored in the `notions` table.
import { z } from 'zod'
import {
  assembleExcerpts,
  excerptSection,
  joinParts,
  LANGUAGE_RULES,
  type GroundingInput,
  type PromptBuild,
  type TopicBrief
} from './common'

/** Bump with any change to the prompt or schema below. */
export const NOTION_OUTLINE_PROMPT_VERSION = 'notion-outline-2'

export const NOTION_OUTLINE_EXCERPT_TOKENS = 6000
export const MIN_NOTIONS = 3
export const MAX_NOTIONS = 8

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Section ids field: from the given list (at least one) when grounded, empty otherwise. */
export function sourceSectionsSchema(sectionIds: readonly string[]) {
  return sectionIds.length > 0
    ? z.array(z.enum(sectionIds as [string, ...string[]])).min(1)
    : z.array(z.string()).max(0)
}

/**
 * Schema of a Notion Outline. Grounded: every sub-topic with content must be cited by at least
 * one notion, so the outline covers the whole topic.
 */
export function notionOutlineSchema(sectionIds: readonly string[], subTopicIds: readonly string[]) {
  return z
    .object({
      notions: z
        .array(
          z.object({
            slug: z.string().regex(SLUG).max(60),
            title: z.string().min(1).max(100),
            description: z.string().min(1).max(300),
            sourceSections: sourceSectionsSchema(sectionIds)
          })
        )
        .min(MIN_NOTIONS)
        .max(MAX_NOTIONS)
    })
    .superRefine(({ notions }, ctx) => {
      const slugs = new Set<string>()
      notions.forEach((notion, index) => {
        if (slugs.has(notion.slug)) {
          ctx.addIssue({
            code: 'custom',
            path: ['notions', index, 'slug'],
            message: `Duplicate slug "${notion.slug}".`
          })
        }
        slugs.add(notion.slug)
      })
      const cited = new Set(notions.flatMap((notion) => notion.sourceSections))
      for (const id of subTopicIds) {
        if (!cited.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['notions'],
            message: `Sub-topic "${id}" is not covered: cite it in the sourceSections of at least one notion.`
          })
        }
      }
    })
}

export type NotionOutline = z.infer<ReturnType<typeof notionOutlineSchema>>

const SYSTEM = `You design the Notion Outline of a system design topic for a French learning app. A notion is one fine-grained idea a learner can be taught in a few paragraphs and tested on with a quiz question, for example "cache-aside" versus "write-through" inside the cache topic. Notions are the unit of mastery tracking.

${LANGUAGE_RULES}`

export function buildNotionOutlineGeneration(
  topic: TopicBrief,
  grounding: GroundingInput
): PromptBuild<NotionOutline> {
  const block = assembleExcerpts(grounding.excerpts, NOTION_OUTLINE_EXCERPT_TOKENS)
  const subTopicIds = block.sectionIds.filter((id) => id.includes('/'))
  const subTopics = grounding.excerpts.filter((excerpt) => subTopicIds.includes(excerpt.sectionId))

  const seed =
    block.sectionIds.length > 0
      ? `The topic comes from the System Design Primer. Its sub-topics are the seed of the outline:
${subTopics.length ? subTopics.map((s) => `- \`${s.sectionId}\`: ${s.title}`).join('\n') : '- (none: the topic is a single section)'}

- Start from the sub-topics. Split a sub-topic that holds several distinct ideas (for example several strategies, each with its own trade-off) into one notion per idea. Merge sub-topics that are too thin to be tested on their own with a close one.
- Every sub-topic listed above must appear in the sourceSections of at least one notion.
- sourceSections: the excerpt ids the notion is taught from (the topic id \`${topic.slug}\` is allowed too).
- Only include notions that the excerpts actually explain: no idea from outside the excerpts.`
      : `The topic belongs to the Foundations Module: prerequisites that the System Design Primer does not cover. Build the outline from well-established basics a beginner needs before studying system design. sourceSections must be empty.`

  const user = joinParts(
    `Build the Notion Outline of the topic "${topic.title}" (id \`${topic.slug}\`) for a complete beginner.`,
    seed,
    `Rules:
- Between 4 and ${MAX_NOTIONS} notions, in teaching order: from the simplest and most fundamental to the most advanced.
- slug: short English kebab-case id built from the technical term (for example \`cache-aside\`, \`write-through\`, \`cache-invalidation\`). It must stay stable, so no numbering and no French.
- title: short French title that keeps the technical terms in English (for example "Cache-aside (lazy loading)").
- description: one French sentence of at most 25 words saying what the learner must understand.
- Notions must not overlap: each idea belongs to exactly one notion.`,
    excerptSection(block)
  )

  return {
    kind: 'notion_outline',
    input: {
      topic: topic.slug,
      title: topic.title,
      sectionIds: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: NOTION_OUTLINE_PROMPT_VERSION, system: SYSTEM, user },
    schema: notionOutlineSchema(block.sectionIds, subTopicIds),
    groundedSourceSections: block.sectionIds
  }
}
