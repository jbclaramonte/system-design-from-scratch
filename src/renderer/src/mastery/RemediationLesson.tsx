import { useEffect, useReducer, useState } from 'react'
import type { RemediationTarget } from '../../../shared/mastery'
import { GenerationErrorView } from '../generation/GenerationErrorView'
import { LessonMarkdown } from '../lesson/LessonMarkdown'
import {
  initialLessonState,
  isLessonRunning,
  lessonReducer,
  type LessonState
} from '../lesson/lessonState'
import { createTextBuffer } from '../lesson/textBuffer'
import { angleLabels } from './masteryText'

/**
 * Streams the Remediation Lesson of one missed notion (from the Content Cache when it exists) and
 * cancels it on unmount. Remount (new `key`) to retry.
 */
function useRemediationLesson(
  topicId: number,
  notionId: number,
  onDone: () => void
): { state: LessonState; cancel: () => void } {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState)
  // One request per mount: Retry remounts the component.
  const [requestId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    let ended = false
    const buffer = createTextBuffer((text) => dispatch({ type: 'text', text }))
    const unsubscribe = window.api.onMasteryEvent(({ requestId: id, event }) => {
      if (id !== requestId || event.type === 'round_ready') return
      if (event.type === 'text_delta') return buffer.push(event.text)
      if (event.type === 'retry') buffer.clear()
      else buffer.flush()
      if (event.type === 'done' || event.type === 'error') ended = true
      dispatch({ type: 'event', event })
      if (event.type === 'done') onDone()
    })
    window.api.startRemediation({ requestId, topicId, notionId }).catch((reason: unknown) => {
      ended = true
      dispatch({
        type: 'event',
        event: { type: 'error', error: { code: 'unknown', message: String(reason) } }
      })
    })
    return () => {
      unsubscribe()
      buffer.clear()
      if (!ended) void window.api.cancelMastery({ requestId })
    }
    // onDone is a refresh callback; a new one must not restart the Generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, notionId, requestId])

  return { state, cancel: () => void window.api.cancelMastery({ requestId }) }
}

/** One Remediation Lesson: short, streamed, on a single missed notion. */
export function RemediationLesson({
  topicId,
  target,
  onDone,
  onRetry
}: {
  topicId: number
  target: RemediationTarget
  onDone: () => void
  onRetry: () => void
}) {
  const { state, cancel } = useRemediationLesson(topicId, target.notion.id, onDone)
  const running = isLessonRunning(state.status)

  return (
    <article className="mastery-remediation" data-testid="remediation-lesson" aria-busy={running}>
      <p className="chip-row">
        <span className="chip chip-progress" data-testid="remediation-angle">
          Angle: {angleLabels[target.angle]}
        </span>
        {state.status === 'done' && (
          <span className="chip" data-testid="remediation-origin">
            {state.fromCache ? 'From cache' : 'Generated'}
          </span>
        )}
      </p>
      {running && (
        <p className="status-strip" role="status" data-testid="remediation-status">
          <span className="spinner" aria-hidden />{' '}
          {state.text ? 'Writing the Remediation Lesson...' : 'Preparing the Remediation Lesson...'}{' '}
          <button
            type="button"
            className="btn-sm"
            onClick={cancel}
            data-testid="remediation-cancel"
          >
            Cancel
          </button>
        </p>
      )}
      {state.error && (
        <GenerationErrorView
          code={state.error.code}
          message={state.error.message}
          title={state.status === 'cancelled' ? 'Remediation Lesson cancelled' : undefined}
          onRetry={onRetry}
          retryTestId="remediation-retry"
          testId="remediation-error"
        />
      )}
      <div className="lesson-body" data-testid="remediation-body">
        <LessonMarkdown markdown={state.text} sources={state.sources} streaming={running} />
      </div>
    </article>
  )
}
