import { useEffect, useRef, useState } from 'react'
import type { QuestionClarification } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'
import type { GradingError } from './useGrading'

export interface ClarificationState {
  /** The reworded question, once there is one. */
  clarification: QuestionClarification | null
  fromCache: boolean
  pending: boolean
  error: GradingError | null
}

/**
 * The Question Clarification of one question of the open round: pending state, typed error,
 * cancellation. It records nothing and is independent of the grading of the answer: the learner
 * can answer while it runs. A call still running when the component goes away is cancelled.
 */
export function useClarification(roundId: number, questionId: number) {
  const [state, setState] = useState<ClarificationState>({
    clarification: null,
    fromCache: false,
    pending: false,
    error: null
  })
  // Synchronous guard: a second click before the re-render is ignored.
  const running = useRef(false)

  useEffect(
    () => () => {
      if (running.current) void window.api.cancelClarification({ roundId, questionId })
    },
    [roundId, questionId]
  )

  /** `another`: a different version than the stored one ("Reformulate differently"). */
  const request = (another = false) => {
    if (running.current) return
    running.current = true
    setState((previous) => ({ ...previous, pending: true, error: null }))
    window.api
      .clarifyQuestion({ roundId, questionId, another })
      .then((outcome) =>
        setState((previous) =>
          outcome.status === 'clarified'
            ? {
                clarification: outcome.clarification,
                fromCache: outcome.fromCache,
                pending: false,
                error: null
              }
            : { ...previous, pending: false, error: outcome.error }
        )
      )
      .catch((reason: unknown) =>
        setState((previous) => ({
          ...previous,
          pending: false,
          error: { code: 'refused', message: errorMessage(reason) }
        }))
      )
      .finally(() => {
        running.current = false
      })
  }

  const cancel = () => {
    void window.api.cancelClarification({ roundId, questionId })
  }

  /** Hides the reworded question; pressing the button again reads it from the cache. */
  const hide = () => setState((previous) => ({ ...previous, clarification: null, error: null }))

  return { ...state, request, cancel, hide }
}
