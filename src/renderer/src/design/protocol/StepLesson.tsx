import { useEffect, useReducer, useRef, useState } from 'react'
import type { ProtocolStep } from '../../../../shared/protocol'
import { GenerationErrorView } from '../../generation/GenerationErrorView'
import { LessonMarkdown } from '../../lesson/LessonMarkdown'
import {
  lessonErrorTitle,
  initialLessonState,
  isLessonRunning,
  lessonReducer,
  type LessonState
} from '../../lesson/lessonState'
import { createTextBuffer } from '../../lesson/textBuffer'

/**
 * Streams the Protocol Step Lesson of a step and cancels it on unmount. Each effect run has its
 * own request id, so a cancelled run (StrictMode mounts effects twice in dev) never reaches the
 * state of the next one.
 */
function useStepLesson(step: ProtocolStep): { state: LessonState; cancel: () => void } {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState)
  const current = useRef<string | null>(null)

  useEffect(() => {
    const requestId = crypto.randomUUID()
    current.current = requestId
    let ended = false
    const buffer = createTextBuffer((text) => dispatch({ type: 'text', text }))
    const unsubscribe = window.api.onProtocolEvent(({ requestId: id, event }) => {
      if (id !== requestId) return
      if (event.type === 'text_delta') return buffer.push(event.text)
      if (event.type === 'retry') buffer.clear()
      else buffer.flush()
      if (event.type === 'done' || event.type === 'error') ended = true
      dispatch({ type: 'event', event })
    })
    window.api.startProtocolStepLesson({ requestId, step }).catch((reason: unknown) => {
      ended = true
      dispatch({
        type: 'event',
        event: { type: 'error', error: { code: 'unknown', message: String(reason) } }
      })
    })
    return () => {
      unsubscribe()
      buffer.clear()
      if (!ended) void window.api.cancelProtocol({ requestId })
    }
  }, [step])

  const cancel = () => {
    if (current.current) void window.api.cancelProtocol({ requestId: current.current })
  }
  return { state, cancel }
}

function StepLessonStream({
  step,
  closeLabel,
  onClose,
  onRetry
}: {
  step: ProtocolStep
  closeLabel: string
  onClose: () => void
  onRetry: () => void
}) {
  const { state, cancel } = useStepLesson(step)
  const running = isLessonRunning(state.status)

  return (
    <article className="protocol-lesson" data-testid="step-lesson" aria-busy={running}>
      <p className="lesson-badges">
        <span className="lesson-badge">Why it matters</span>
        {state.status === 'done' && (
          <span className="lesson-badge" data-testid="step-lesson-origin">
            {state.fromCache ? 'From cache' : 'Generated'}
          </span>
        )}
      </p>
      {running && (
        <p className="lesson-status" role="status" data-testid="step-lesson-status">
          <span className="lesson-spinner" aria-hidden />{' '}
          {state.text ? 'Writing the lesson...' : 'Preparing the lesson...'}{' '}
          <button type="button" onClick={cancel}>
            Cancel
          </button>
        </p>
      )}
      {state.error && (
        <GenerationErrorView
          code={state.error.code}
          message={state.error.message}
          title={lessonErrorTitle(state.error.code)}
          onRetry={onRetry}
          retryTestId="step-lesson-retry"
          testId="step-lesson-error"
        />
      )}
      <div className="lesson-body" data-testid="step-lesson-body">
        <LessonMarkdown markdown={state.text} sources={state.sources} streaming={running} />
      </div>
      <p>
        <button
          type="button"
          data-testid="step-lesson-close"
          disabled={state.status !== 'done'}
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </p>
    </article>
  )
}

/**
 * The "why it matters" Protocol Step Lesson of a step, streamed (or served from the Content
 * Cache). `onClose` acknowledges it; Retry starts a new request.
 */
export function StepLesson(props: { step: ProtocolStep; closeLabel: string; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <StepLessonStream
      key={`${props.step}-${attempt}`}
      {...props}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  )
}
