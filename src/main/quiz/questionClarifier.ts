// Question Clarification through the Generation Service (kind `question_clarification`), stored in
// the Content Cache per Question and prompt version.
import type { Database } from '../db'
import { contentCacheKey, getCachedContent } from '../db/repositories/contentCache'
import {
  buildQuestionClarificationGeneration,
  QUESTION_CLARIFICATION_TIMEOUT_MS,
  questionClarificationSchema,
  type QuestionBrief
} from '../generation/prompts/questionClarification'
import type { GenerationService } from '../generation/service'
import type { QuestionClarification } from '../../shared/quiz'

export interface ClarifiedQuestion {
  clarification: QuestionClarification
  /** Read from the Content Cache: no Generation ran. */
  fromCache: boolean
}

export interface ClarifyOptions {
  /**
   * "Reformulate differently": skips the cache, asks for a clearly different version (the stored
   * one is given to the prompt) and replaces the stored entry with it.
   */
  another?: boolean
  signal?: AbortSignal
}

/** Rewords one question. Rejects with a `GenerationError` (cancelled, cli_not_found...). */
export interface QuestionClarifier {
  clarify(brief: QuestionBrief, options?: ClarifyOptions): Promise<ClarifiedQuestion>
}

export function createQuestionClarifier(
  service: Pick<GenerationService, 'generate'>,
  db: Database
): QuestionClarifier {
  return {
    async clarify(brief, { another = false, signal } = {}) {
      let build = buildQuestionClarificationGeneration(brief)
      if (another) {
        const key = contentCacheKey(
          'question_clarification',
          build.input,
          build.prompt.version,
          build.language
        )
        const stored = questionClarificationSchema.safeParse(getCachedContent(db, key)?.content)
        if (stored.success) build = buildQuestionClarificationGeneration(brief, stored.data)
      }
      const result = await service.generate({
        ...build,
        // The learner asks for it but nothing waits on it: a background job leaves the foreground
        // slot of a grading free (the queue keeps one slot for foreground work).
        priority: 'background',
        refresh: another,
        signal,
        timeoutMs: QUESTION_CLARIFICATION_TIMEOUT_MS
      }).result
      return { clarification: result.content, fromCache: result.fromCache }
    }
  }
}
