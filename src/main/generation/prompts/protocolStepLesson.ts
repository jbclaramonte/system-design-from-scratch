// Protocol Step Lesson prompt: the short "why it matters" lesson shown the first time the learner
// meets a Protocol Step. Streamed Markdown, grounded on the primer's interview-method section
// ("How to approach a system design interview question", not a teachable Topic) plus a few
// supporting sections. One lesson per step, the same in every exercise: stored in the Content
// Cache.
import type { Excerpt } from '../../corpus/lookup'
import { PROTOCOL_STEP_DEFINITIONS, type ProtocolStep } from '../../../shared/protocol'
import {
  assembleExcerpts,
  AUDIENCE_RULES,
  DIAGRAM_RULES,
  diagramPlacementRules,
  excerptSection,
  groundingRules,
  joinParts,
  LANGUAGE_RULES,
  type GroundingInput,
  type PromptBuild
} from './common'
import { repairDiagrams } from '../diagrams'

/** Bump with any change to the prompt below. */
export const PROTOCOL_STEP_LESSON_PROMPT_VERSION = 'protocol-step-lesson-3'

/** Excerpt budget of one Protocol Step Lesson. */
export const PROTOCOL_STEP_LESSON_EXCERPT_TOKENS = 2500

const INTERVIEW = 'how-to-approach-a-system-design-interview-question'

/**
 * Source Corpus sections each step is grounded on: the matching part of the interview method
 * first, then sections that back it (back-of-the-envelope tables, REST, SQL or NoSQL...).
 */
export const PROTOCOL_STEP_LESSON_SECTIONS: Record<ProtocolStep, string[]> = {
  functional_requirements: [`${INTERVIEW}/step-1-outline-use-cases-constraints-and-assumptions`],
  non_functional_requirements: [
    `${INTERVIEW}/step-1-outline-use-cases-constraints-and-assumptions`,
    'performance-vs-scalability',
    'latency-vs-throughput',
    'availability-vs-consistency/cap-theorem'
  ],
  estimations: [
    `${INTERVIEW}/back-of-the-envelope-calculations`,
    `${INTERVIEW}/step-1-outline-use-cases-constraints-and-assumptions`,
    'appendix/powers-of-two-table',
    'appendix/latency-numbers-every-programmer-should-know'
  ],
  api: [
    `${INTERVIEW}/step-3-design-core-components`,
    'communication/representational-state-transfer-rest'
  ],
  data_model: [`${INTERVIEW}/step-3-design-core-components`, 'database/sql-or-nosql'],
  high_level_design: [
    `${INTERVIEW}/step-2-create-a-high-level-design`,
    `${INTERVIEW}/step-3-design-core-components`
  ],
  deep_dive: [`${INTERVIEW}/step-4-scale-the-design`, `${INTERVIEW}/step-3-design-core-components`]
}

const SYSTEM = `You write short "why it matters" lessons that introduce one step of the system design interview method to a beginner, right before they practise it on a design exercise.

${LANGUAGE_RULES}

${AUDIENCE_RULES}

${DIAGRAM_RULES}

Output: Markdown only, no preamble, no closing remark.`

/** The French title of the lesson is left to the model; the step is named in English here. */
export function buildProtocolStepLessonGeneration(
  step: ProtocolStep,
  grounding: GroundingInput
): PromptBuild<string> {
  const definition = PROTOCOL_STEP_DEFINITIONS[step]
  const block = assembleExcerpts(grounding.excerpts, PROTOCOL_STEP_LESSON_EXCERPT_TOKENS)
  const checklist = definition.checklist.map((item) => `- ${item.item}`).join('\n')
  const user = joinParts(
    `Write the "why it matters" lesson of the interview step "${definition.title}".`,
    `Goal of the step: ${definition.goal}`,
    `What the learner will be asked to produce in this step (the feedback checks these points):\n${checklist}`,
    definition.input === 'canvas'
      ? 'The learner will draw this step on a diagram canvas with typed components (client, CDN, load balancer, service, cache, database, queue) and arrows.'
      : 'The learner will write this step as a short list in a text editor.',
    `Structure:
1. \`## <French title of the step>\`, then 2 or 3 sentences: what this step is, where it sits in the interview (after which step, before which one).
2. \`### Pourquoi c'est important\`: 2 to 4 bullets, each a concrete consequence of skipping or rushing the step (what goes wrong later in the design or in the interview).
3. \`### Ce que tu vas produire\`: 2 to 4 bullets matching the points above, in plain words.
4. \`### Piège fréquent\`: one beginner mistake, in one or two sentences.
5. \`**À retenir**\`: one sentence.
150 to 250 words in total. Use one small running example (a link-shortening service) for illustration only; do not solve the exercise.`,
    diagramPlacementRules({
      min: 0,
      max: 2,
      when: 'only where a picture helps this step on the running example (for example a typical high-level design, or the data model); none for a step that is just a list'
    }),
    groundingRules(block.sectionIds),
    excerptSection(block)
  )
  return {
    kind: 'protocol_step_lesson',
    input: {
      step,
      excerpts: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: PROTOCOL_STEP_LESSON_PROMPT_VERSION, system: SYSTEM, user },
    groundedSourceSections: block.sectionIds,
    finalize: repairDiagrams
  }
}

/** Excerpts of a step's sections, in the order of `PROTOCOL_STEP_LESSON_SECTIONS`. */
export function protocolStepLessonExcerpts(
  step: ProtocolStep,
  findSection: (sectionId: string) => Excerpt | undefined
): Excerpt[] {
  return PROTOCOL_STEP_LESSON_SECTIONS[step].flatMap((id) => {
    const excerpt = findSection(id)
    return excerpt ? [excerpt] : []
  })
}
