// Reference Solution as the Design Feedback prompts read it: only the parts of the primer's
// solution that answer the Protocol Steps being judged, so a step that is not part of the
// exercise (estimations in exercise 1) is never held against the learner.
import type { ReferenceSolution } from '../corpus'
import { PROTOCOL_STEP_DEFINITIONS, protocolSteps, type ProtocolStep } from '../../shared/protocol'

/** Parts of a primer solution, in the order they are given. */
export const referenceParts = [
  'use_cases',
  'constraints',
  'high_level_design',
  'core_components',
  'scaled_design',
  'talking_points'
] as const
export type ReferencePart = (typeof referenceParts)[number]

/**
 * Which parts answer each step. Primer layout: Step 1 holds the use cases (in and out of scope)
 * and the constraints with the back-of-the-envelope usage; Step 2 is a diagram (not bundled);
 * Step 3 describes the components, their API and their tables; Step 4 scales the design.
 */
export const REFERENCE_PARTS_BY_STEP: Record<ProtocolStep, readonly ReferencePart[]> = {
  functional_requirements: ['use_cases'],
  non_functional_requirements: ['constraints'],
  estimations: ['constraints'],
  api: ['core_components'],
  data_model: ['core_components'],
  high_level_design: ['high_level_design', 'core_components'],
  deep_dive: ['scaled_design', 'talking_points']
}

/** Primer step id prefix of the parts taken from `ReferenceSolution.steps`. */
const STEP_PREFIX: Partial<Record<ReferencePart, string>> = {
  high_level_design: 'step-2-',
  core_components: 'step-3-',
  scaled_design: 'step-4-',
  talking_points: 'additional-talking-points'
}

const PART_TITLES: Record<ReferencePart, string> = {
  use_cases: 'Use cases (in and out of scope)',
  constraints: 'Constraints, assumptions and back-of-the-envelope usage',
  high_level_design: 'High-level design (the diagram is not available)',
  core_components: 'Core components',
  scaled_design: 'Scaling the design',
  talking_points: 'Additional talking points'
}

/** Said with the constraints: the learner was given no number. */
const CONSTRAINTS_NOTE =
  'The learner was given no number: they state their own assumptions. Judge the method and whether the orders of magnitude follow from their assumptions, not whether they match these numbers.'

function partMarkdown(solution: ReferenceSolution, part: ReferencePart): string {
  switch (part) {
    case 'use_cases':
      return solution.useCases.trim()
    case 'constraints':
      return `${CONSTRAINTS_NOTE}\n\n${solution.constraints.trim()}`
    default: {
      const prefix = STEP_PREFIX[part]!
      return solution.steps.find((step) => step.id.startsWith(prefix))?.markdown.trim() ?? ''
    }
  }
}

/**
 * The parts of `solution` that answer `steps`, as Markdown under a header naming the steps. A
 * part found empty in the solution is left out.
 */
export function referenceForSteps(
  solution: ReferenceSolution,
  steps: readonly ProtocolStep[]
): string {
  const ordered = protocolSteps.filter((step) => steps.includes(step))
  const wanted = new Set(ordered.flatMap((step) => REFERENCE_PARTS_BY_STEP[step]))
  const parts = referenceParts.flatMap((part) => {
    if (!wanted.has(part)) return []
    const markdown = partMarkdown(solution, part)
    return markdown ? [`## ${PART_TITLES[part]}\n\n${markdown}`] : []
  })
  const titles = ordered.map((step) => PROTOCOL_STEP_DEFINITIONS[step].title).join(', ')
  return [
    `# ${solution.title}`,
    `Only the parts of the primer's solution that answer these Protocol Steps: ${titles}.`,
    ...parts
  ].join('\n\n')
}
