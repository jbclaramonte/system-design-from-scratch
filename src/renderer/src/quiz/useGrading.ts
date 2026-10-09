import { useEffect, useRef, useState } from 'react'
import type { GenerationErrorCode } from '../../../shared/generation'
import type { FreeAnswerGradingOutcome, QuestionFeedback } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'

export interface GradingError {
  /** `refused`: the main process refused the call (completed round, already answered...). */
  code: GenerationErrorCode | 'refused'
  message: string
}

/**
 * A free-answer grading (or contest re-grade) of one question: pending state, typed error,
 * cancellation. A grading still running when the component goes away is cancelled.
 */
export function useGrading(roundId: number, questionId: number) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<GradingError | null>(null)
  // Synchronous guard: a second click or Ctrl+Enter before the re-render is ignored.
  const running = useRef(false)

  useEffect(
    () => () => {
      if (running.current) void window.api.cancelGrading({ roundId, questionId })
    },
    [roundId, questionId]
  )

  const run = (
    call: () => Promise<FreeAnswerGradingOutcome>,
    onGraded: (feedback: QuestionFeedback) => void
  ) => {
    if (running.current) return
    running.current = true
    setPending(true)
    setError(null)
    call()
      .then((outcome) => {
        if (outcome.status === 'graded') onGraded(outcome.feedback)
        else setError(outcome.error)
      })
      .catch((reason: unknown) => setError({ code: 'refused', message: errorMessage(reason) }))
      .finally(() => {
        running.current = false
        setPending(false)
      })
  }

  const cancel = () => {
    void window.api.cancelGrading({ roundId, questionId })
  }

  return { pending, error, run, cancel }
}
