// Free-answer grading through the Generation Service (kind `free_answer_grading`, never cached).
import {
  buildFreeAnswerGradingGeneration,
  FREE_ANSWER_GRADING_TIMEOUT_MS,
  type FreeAnswerGradingRequest
} from '../generation/prompts/freeAnswerGrading'
import type { GenerationService } from '../generation/service'
import type { FreeAnswerGrading } from '../../shared/quiz'

export interface GradedFreeAnswer {
  grading: FreeAnswerGrading
  promptVersion: string
}

/** Grades one free answer. Rejects with a `GenerationError` (cancelled, cli_not_found...). */
export interface FreeAnswerGrader {
  grade(request: FreeAnswerGradingRequest, signal?: AbortSignal): Promise<GradedFreeAnswer>
}

export function createFreeAnswerGrader(
  service: Pick<GenerationService, 'generate'>
): FreeAnswerGrader {
  return {
    async grade(request, signal) {
      const build = buildFreeAnswerGradingGeneration(request)
      const { content } = await service.generate({
        ...build,
        priority: 'foreground',
        signal,
        timeoutMs: FREE_ANSWER_GRADING_TIMEOUT_MS
      }).result
      return { grading: content, promptVersion: build.prompt.version }
    }
  }
}
