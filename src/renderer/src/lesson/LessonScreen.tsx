import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { TopicSummary } from '../../../shared/topic'
import { GenerationErrorView } from '../generation/GenerationErrorView'
import { shortSourceLabel } from './citations'
import { LessonMarkdown } from './LessonMarkdown'
import {
  lessonErrorTitle,
  initialLessonState,
  isLessonRunning,
  lessonReducer,
  type LessonState
} from './lessonState'
import { OutsidePrimerBadge } from './OutsidePrimerBadge'
import { createTextBuffer, isNearBottom } from './textBuffer'

/**
 * Starts the topic's lesson on mount and cancels it on unmount. Text deltas are batched; the
 * caller remounts (new `key`) to retry.
 */
function useLesson(topicId: number): { state: LessonState; cancel: () => void } {
  const [state, dispatch] = useReducer(lessonReducer, initialLessonState)
  const requestRef = useRef<string | null>(null)

  useEffect(() => {
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    let ended = false
    const buffer = createTextBuffer((text) => dispatch({ type: 'text', text }))
    const unsubscribe = window.api.onLessonEvent(({ requestId: id, event }) => {
      if (id !== requestId) return
      if (event.type === 'text_delta') return buffer.push(event.text)
      if (event.type === 'retry') buffer.clear()
      else buffer.flush()
      if (event.type === 'done' || event.type === 'error') ended = true
      dispatch({ type: 'event', event })
    })
    window.api.startLesson({ requestId, topicId }).catch((reason: unknown) => {
      ended = true
      dispatch({
        type: 'event',
        event: { type: 'error', error: { code: 'unknown', message: String(reason) } }
      })
    })
    return () => {
      unsubscribe()
      buffer.clear()
      if (!ended) void window.api.cancelLesson({ requestId })
    }
  }, [topicId])

  const cancel = () => {
    if (requestRef.current) void window.api.cancelLesson({ requestId: requestRef.current })
  }
  return { state, cancel }
}

function statusText({ status, text }: LessonState): string | null {
  switch (status) {
    case 'starting':
      return 'Preparing the lesson...'
    case 'outline':
      return 'Splitting the topic into notions (first open only)...'
    case 'queued':
      return 'Waiting for a free generation slot...'
    case 'generating':
      return text ? 'Writing the lesson...' : 'Generating the lesson...'
    default:
      return null
  }
}

export function LessonScreen({
  topic,
  onRetry,
  onDone,
  embedded = false
}: {
  topic: TopicSummary
  onRetry: () => void
  /** Called once the lesson is complete (streamed or from the Content Cache). */
  onDone?: () => void
  /**
   * Inside the topic screen, whose heading and progress line already show the topic title and
   * the Outside the primer badge: neither is repeated. Standalone (Lessons dev screen) by default.
   */
  embedded?: boolean
}) {
  const { state, cancel } = useLesson(topic.id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const running = isLessonRunning(state.status)
  const status = statusText(state)
  const grounded = state.grounded ?? topic.grounded

  const done = state.status === 'done'
  useEffect(() => {
    if (done) onDone?.()
  }, [done, onDone])

  // Follow the stream while the learner stays at the bottom; scrolling up stops following.
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element && state.status === 'generating' && followRef.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [state.text, state.status])

  const scrollToNotion = (slug: string) =>
    scrollRef.current
      ?.querySelector(`[data-notion="${slug}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <section className="lesson-screen" data-testid="lesson-screen">
      <header className="lesson-header">
        {!embedded && <h2>{topic.title}</h2>}
        <div className="lesson-badges">
          {grounded ? (
            <span className="chip" title="Grounded on the System Design Primer">
              System Design Primer
            </span>
          ) : (
            !embedded && <OutsidePrimerBadge testId="lesson-ungrounded" />
          )}
          {state.status === 'done' && (
            <span className="chip" data-testid="lesson-origin">
              {state.fromCache ? 'From cache' : 'Generated'}
            </span>
          )}
        </div>
        {state.notions.length > 0 && (
          <nav className="lesson-notions" aria-label="Notions">
            <span className="label-caps" aria-hidden>
              Notions
            </span>
            {state.notions.map((notion) => (
              <button
                key={notion.id}
                type="button"
                title={notion.description ?? undefined}
                onClick={() => scrollToNotion(notion.slug)}
              >
                {notion.title}
              </button>
            ))}
          </nav>
        )}
        {status && (
          <p className="lesson-status" role="status" data-testid="lesson-status">
            <span className="lesson-spinner" aria-hidden /> {status}{' '}
            {running && (
              <button type="button" onClick={cancel} data-testid="lesson-cancel">
                Cancel
              </button>
            )}
          </p>
        )}
        {state.error && (
          <GenerationErrorView
            code={state.error.code}
            message={state.error.message}
            title={lessonErrorTitle(state.error.code)}
            onRetry={onRetry}
            retryTestId="lesson-retry"
            testId="lesson-error"
          />
        )}
      </header>
      <div
        className="lesson-scroll"
        ref={scrollRef}
        onScroll={(event) => (followRef.current = isNearBottom(event.currentTarget))}
      >
        <article className="lesson-body" data-testid="lesson-body" aria-busy={running}>
          <LessonMarkdown markdown={state.text} sources={state.sources} streaming={running} />
        </article>
        {state.status === 'done' && state.sources.length > 0 && (
          <footer className="lesson-sources">
            <h3>Sources</h3>
            <p>
              Excerpts of the{' '}
              <a
                href="https://github.com/donnemartin/system-design-primer"
                target="_blank"
                rel="noreferrer"
              >
                System Design Primer
              </a>{' '}
              (
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY 4.0
              </a>
              ), adapted and translated by a generated lesson:
            </p>
            <ul>
              {state.sources.map((source) => (
                <li key={source.sectionId}>
                  <a href={source.url} target="_blank" rel="noreferrer" title={source.label}>
                    {shortSourceLabel(source.label)}
                  </a>{' '}
                  <code>{source.sectionId}</code>
                </li>
              ))}
            </ul>
          </footer>
        )}
      </div>
    </section>
  )
}
