// PLACEHOLDER prompts and schemas, only used by the generic `generation:start` IPC round trip
// (the dev panel), which receives free-form input. The real prompts live in `./prompts` and run
// through `./pipelines` (issue #7); free-answer grading (#10) and design feedback (#14) prompts
// are still to come. Do not build on this file.
import { z } from 'zod'
import type { GenerationKind, Json } from '../../shared/generation'
import type { GenerationPrompt } from './service'

/** Bump with any prompt change: it is part of the Content Cache key. */
export const PLACEHOLDER_PROMPT_VERSION = 'placeholder-1'

const SYSTEM =
  'PLACEHOLDER system prompt (issue #7). You generate content for a system design learning app. Output only the requested content, no preamble.'

const placeholderSchemas = {
  quiz: z.object({
    questions: z
      .array(
        z.object({
          prompt: z.string().min(1),
          choices: z.array(z.string()).min(2),
          correct: z.array(z.number().int().min(0)).min(1)
        })
      )
      .min(1)
  }),
  free_answer_grading: z.object({
    result: z.enum(['correct', 'partially_correct', 'incorrect']),
    score: z.number().min(0).max(1),
    feedback: z.string()
  }),
  design_feedback: z.object({ feedback: z.string().min(1) })
} satisfies Partial<Record<GenerationKind, z.ZodType>>

export interface PlaceholderGeneration {
  prompt: GenerationPrompt
  schema?: z.ZodType<Json>
  groundedSourceSections: string[]
}

/** Corpus section ids listed in the input as `sectionIds`, if any. */
function sectionIdsOf(input: Json): string[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return []
  const ids = input['sectionIds']
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

export function buildPlaceholderGeneration(
  kind: GenerationKind,
  input: Json
): PlaceholderGeneration {
  const schema = (placeholderSchemas as Partial<Record<GenerationKind, z.ZodType>>)[kind]
  const task = schema
    ? `Return a small ${kind} as JSON matching the schema.`
    : 'Write one short Markdown paragraph (at most 60 words).'
  return {
    prompt: {
      version: PLACEHOLDER_PROMPT_VERSION,
      system: SYSTEM,
      user: `PLACEHOLDER prompt (issue #7). ${task}\n\nInput:\n${JSON.stringify(input)}`
    },
    schema: schema as z.ZodType<Json> | undefined,
    groundedSourceSections: sectionIdsOf(input)
  }
}
