import { useEffect, useRef, useState } from 'react'
import type { GenerationErrorCode } from '../../../../shared/generation'
import type { ProtocolExerciseView, ProtocolOutcome } from '../../../../shared/protocol'
import { errorMessage } from '../../quiz/errorMessage'

export interface ProtocolCallError {
  /** `refused`: the main process refused the call (inactive step, empty submission...). */
  code: GenerationErrorCode | 'refused'
  message: string
}

/**
 * One Generation-backed protocol call at a time (step feedback, Hint or final review): pending
 * state, typed error, cancellation. A call still running when the component goes away is
 * cancelled. Every outcome carries the refreshed exercise, handed to `onExercise`.
 */
export function useProtocolCall(onExercise: (view: ProtocolExerciseView) => void) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ProtocolCallError | null>(null)
  // Synchronous guard: a second click before the re-render is ignored.
  const running = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (running.current) void window.api.cancelProtocol({ requestId: running.current })
    },
    []
  )

  const run = <T>(
    call: (requestId: string) => Promise<ProtocolOutcome<T>>,
    onDone?: (value: T) => void
  ) => {
    if (running.current) return
    const requestId = crypto.randomUUID()
    running.current = requestId
    setPending(true)
    setError(null)
    call(requestId)
      .then((outcome) => {
        onExercise(outcome.exercise)
        if (outcome.status === 'done') onDone?.(outcome.value)
        else setError(outcome.error)
      })
      .catch((reason: unknown) => setError({ code: 'refused', message: errorMessage(reason) }))
      .finally(() => {
        running.current = null
        setPending(false)
      })
  }

  const cancel = () => {
    if (running.current) void window.api.cancelProtocol({ requestId: running.current })
  }

  return { pending, error, run, cancel }
}
