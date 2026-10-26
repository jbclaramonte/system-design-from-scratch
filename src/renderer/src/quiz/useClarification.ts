import { useEffect, useRef, useState } from 'react'
import type { QuestionClarification } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'
import type { GradingError } from './useGrading'

/** What the question belongs to: a Round, or a Recall Quiz session. */
export type ClarifyTarget =
  { kind: 'round'; roundId: number } | { kind: 'recall'; sessionId: number }

const targetId = (target: ClarifyTarget) =>
  target.kind === 'round' ? target.roundId : target.sessionId

const requestClarification = (target: ClarifyTarget, questionId: number, another: boolean) =>
  target.kind === 'round'
    ? window.api.clarifyQuestion({ roundId: target.roundId, questionId, another })
    : window.api.clarifyRecallQuestion({ sessionId: target.sessionId, questionId, another })

const cancelClarification = (target: ClarifyTarget, questionId: number) =>
  target.kind === 'round'
    ? window.api.cancelClarification({ roundId: target.roundId, questionId })
    : window.api.cancelRecallClarification({ sessionId: target.sessionId, questionId })

export interface ClarificationState {
  /** The reworded question, once there is one. */
  clarification: QuestionClarification | null
  fromCache: boolean
  pending: boolean
  error: GradingError | null
}

/**
 * The Question Clarification of one question of the open round (or Recall Quiz session): pending
 * state, typed error, cancellation. It records nothing and is independent of the grading of the answer: the learner
 * can answer while it runs. A call still running when the component goes away is cancelled.
 */
export function useClarification(target: ClarifyTarget, questionId: number) {
  const [state, setState] = useState<ClarificationState>({
    clarification: null,
    fromCache: false,
    pending: false,
    error: null
  })
  // Synchronous guard: a second click before the re-render is ignored.
  const running = useRef(false)

  const { kind } = target
  const id = targetId(target)
  useEffect(
    () => () => {
      if (!running.current) return
      void cancelClarification(
        kind === 'round' ? { kind, roundId: id } : { kind, sessionId: id },
        questionId
      )
    },
    [kind, id, questionId]
  )

  /** `another`: a different version than the stored one ("Reformulate differently"). */
  const request = (another = false) => {
    if (running.current) return
    running.current = true
    setState((previous) => ({ ...previous, pending: true, error: null }))
    requestClarification(target, questionId, another)
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
    void cancelClarification(target, questionId)
  }

  /** Hides the reworded question; pressing the button again reads it from the cache. */
  const hide = () => setState((previous) => ({ ...previous, clarification: null, error: null }))

  return { ...state, request, cancel, hide }
}
