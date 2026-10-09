// Remediation Lesson prompt: a short French lesson on ONE missed notion, from a different angle
// than the original lesson, grounded on the notion's own excerpts.
import {
  assembleExcerpts,
  AUDIENCE_RULES,
  excerptSection,
  groundingRules,
  joinParts,
  LANGUAGE_RULES,
  type GroundingInput,
  type NotionBrief,
  type PromptBuild,
  type TopicBrief
} from './common'

/** Bump with any change to the prompt below. */
export const REMEDIATION_LESSON_PROMPT_VERSION = 'remediation-lesson-1'

export const REMEDIATION_EXCERPT_TOKENS = 3000

/** The angle of a Remediation Lesson. The original lesson is a step-by-step explanation. */
export const remediationAngles = ['concrete_example', 'analogy'] as const
export type RemediationAngle = (typeof remediationAngles)[number]

/** Heading of the closing takeaways of a Remediation Lesson. */
export const TAKEAWAYS_HEADING = 'À retenir'

const angleInstructions: Record<RemediationAngle, string> = {
  concrete_example:
    'Build the whole explanation around ONE realistic, concrete scenario (for example an online shop or a social network), followed step by step with small numbers: what happens to each request, what the learner would observe, what goes wrong without the notion. Name the notion explicitly once the scenario has made it visible.',
  analogy:
    'Build the whole explanation around ONE everyday analogy that has nothing to do with computers (a library, a restaurant, a post office...). Then map each element of the analogy back to the technical notion explicitly, and say in one sentence where the analogy stops working.'
}

export interface RemediationOptions {
  angle: RemediationAngle
  /** Prompts of the questions the learner missed on this notion, to target the misunderstanding. */
  missedQuestionPrompts?: string[]
}

const SYSTEM = `You are a patient system design tutor. The learner just failed quiz questions on one notion after reading a standard step-by-step lesson about it. You write a short remediation lesson that explains that single notion again, differently.

${LANGUAGE_RULES}

${AUDIENCE_RULES}

Output only the remediation lesson, in Markdown: no preamble, no closing remark, no code fence around it.`

export function buildRemediationLessonGeneration(
  topic: TopicBrief,
  notion: NotionBrief,
  grounding: GroundingInput,
  options: RemediationOptions
): PromptBuild<string> {
  const block = assembleExcerpts(grounding.excerpts, REMEDIATION_EXCERPT_TOKENS)
  const missed = options.missedQuestionPrompts ?? []
  const user = joinParts(
    `Write a remediation lesson on the notion "${notion.title}" (\`${notion.slug}\`) of the topic "${topic.title}".${notion.description ? `\nWhat the learner must understand: ${notion.description}` : ''}`,
    `Angle: ${angleInstructions[options.angle]} Do not repeat the textbook definition first: the learner already read it and it did not stick.`,
    missed.length > 0 &&
      `The learner got these questions wrong. Address the misunderstanding they reveal, without quoting or answering them directly:\n${missed.map((prompt) => `- ${prompt}`).join('\n')}`,
    `Structure: a \`## ${notion.title}\` heading, the explanation (200 to 350 words, short paragraphs), then a \`**${TAKEAWAYS_HEADING}**\` line followed by 2 or 3 bullets. Stay on this notion only; mention another notion only to contrast it in one sentence.`,
    groundingRules(block.sectionIds),
    excerptSection(block)
  )
  return {
    kind: 'remediation_lesson',
    input: {
      topic: topic.slug,
      notion: { slug: notion.slug, title: notion.title },
      angle: options.angle,
      missedQuestionPrompts: missed,
      sectionIds: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: REMEDIATION_LESSON_PROMPT_VERSION, system: SYSTEM, user },
    groundedSourceSections: block.sectionIds
  }
}
