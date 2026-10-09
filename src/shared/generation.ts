/**
 * Generation types shared by the main process (src/main/generation) and the renderer, so the
 * stream of events sent over IPC is typed on both sides.
 */
import type { Json } from './json'

export type { Json }

/**
 * What a Generation produces. The first three are stored in the Content Cache. A Notion Outline
 * is stored in the `notions` table instead, once per topic.
 */
export const generationKinds = [
  'lesson',
  'remediation_lesson',
  'quiz',
  'notion_outline',
  'free_answer_grading',
  'design_feedback'
] as const
export type GenerationKind = (typeof generationKinds)[number]

/**
 * `foreground`: the learner is waiting for it. `background`: a pre-generation (for example the
 * quiz while the lesson is read), queued behind foreground requests and cancellable.
 */
export type GenerationPriority = 'foreground' | 'background'

export const generationErrorCodes = [
  'cli_not_found',
  'not_logged_in',
  'quota_or_rate_limit',
  'bad_model',
  'timeout',
  'invalid_output',
  'cancelled',
  'unknown'
] as const
export type GenerationErrorCode = (typeof generationErrorCodes)[number]

export interface GenerationErrorInfo {
  code: GenerationErrorCode
  /** User-actionable message (what happened and what to do). */
  message: string
}

export interface GenerationUsage {
  inputTokens: number | null
  outputTokens: number | null
  /** List price reported by the CLI, informational on a subscription. */
  costUsd: number | null
}

export interface GenerationOutput {
  /** Markdown string for text generations, the validated object for structured ones. */
  content: Json
  fromCache: boolean
  grounded: boolean
  /** Source Corpus section ids, for example `cache/when-to-update-the-cache`. */
  sourceSections: string[]
  /** Content Cache key, null for kinds that are not cached. */
  cacheKey: string | null
  /** Null on a cache hit. */
  usage: GenerationUsage | null
}

export type GenerationEvent =
  | { type: 'queued' }
  | { type: 'started'; attempt: number }
  /** A chunk of streamed text (text generations only; structured ones only send `done`). */
  | { type: 'text_delta'; text: string }
  /** The previous attempt returned invalid output; a new attempt starts with the error fed back. */
  | { type: 'retry'; reason: string }
  | { type: 'done'; output: GenerationOutput }
  | { type: 'error'; error: GenerationErrorInfo }

/** `done` and `error` end a stream. */
export const isTerminalGenerationEvent = (
  event: GenerationEvent
): event is Extract<GenerationEvent, { type: 'done' | 'error' }> =>
  event.type === 'done' || event.type === 'error'
