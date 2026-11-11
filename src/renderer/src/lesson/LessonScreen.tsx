import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TopicSummary } from '../../../shared/topic'
import { GenerationErrorView } from '../generation/GenerationErrorView'
import { LessonAsk } from './ask/LessonAsk'
import { LessonMarkdown } from './LessonMarkdown'
import { LessonSources } from './LessonSources'
import {
  lessonErrorTitle,
  initialLessonState,
  isLessonRunning,
  lessonReducer,
  type LessonState
} from './lessonState'
import { activeNotion } from './notionSpy'
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

/** The notions of the Lesson: a click scrolls to it, the notion being read is marked. */
function LessonNotions({
  notions,
  active,
  onSelect
}: {
  notions: LessonState['notions']
  active: string | null
  onSelect: (slug: string) => void
}) {
  return (
    <nav className="lesson-notions" aria-label="Notions" data-testid="lesson-notions">
      <span className="label-caps" aria-hidden>
        Notions
      </span>
      {notions.map((notion) => (
        <button
          key={notion.id}
          type="button"
          lang="fr"
          title={notion.description ?? undefined}
          aria-current={notion.slug === active ? 'location' : undefined}
          onClick={() => onSelect(notion.slug)}
        >
          {notion.title}
        </button>
      ))}
    </nav>
  )
}

export function LessonScreen({
  topic,
  onRetry,
  onDone,
  embedded = false,
  notionsSlot = null
}: {
  topic: TopicSummary
  onRetry: () => void
  /** Called once the lesson is complete (streamed or from the Content Cache). */
  onDone?: () => void
  /**
   * Inside the topic screen, whose heading and sidebar already show the topic title and the
   * grounding badge: neither is repeated. Standalone (Lessons dev screen) by default.
   */
  embedded?: boolean
  /** Where the notion list goes (the topic screen sidebar); in the header when null. */
  notionsSlot?: HTMLElement | null
}) {
  const { state, cancel } = useLesson(topic.id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
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

  const updateActive = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const top = element.getBoundingClientRect().top
    const anchors = [...element.querySelectorAll<HTMLElement>('[data-notion]')].map((anchor) => ({
      slug: anchor.dataset.notion ?? '',
      offset: anchor.getBoundingClientRect().top - top
    }))
    setActiveSlug(
      activeNotion(anchors, {
        threshold: element.clientHeight / 4,
        viewport: element.clientHeight,
        atBottom: isNearBottom(element, 2)
      })
    )
  }, [])

  useLayoutEffect(updateActive, [state.text, updateActive])

  const scrollToNotion = (slug: string) =>
    scrollRef.current
      ?.querySelector(`[data-notion="${slug}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const notions = state.notions.length > 0 && (
    <LessonNotions notions={state.notions} active={activeSlug} onSelect={scrollToNotion} />
  )

  return (
    <section className="lesson-screen" data-testid="lesson-screen">
      <header className="lesson-header">
        {!embedded && <h2>{topic.title}</h2>}
        {!embedded && (
          <div className="chip-row">
            {grounded ? (
              <span className="chip" title="Grounded on the System Design Primer">
                System Design Primer
              </span>
            ) : (
              <OutsidePrimerBadge testId="lesson-ungrounded" />
            )}
          </div>
        )}
        {notionsSlot ? notions && createPortal(notions, notionsSlot) : notions}
        {status && (
          <p className="status-strip" role="status" data-testid="lesson-status">
            <span className="spinner" aria-hidden /> {status}{' '}
            {running && (
              <button type="button" className="btn-sm" onClick={cancel} data-testid="lesson-cancel">
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
      <LessonAsk context={{ kind: 'lesson', topicId: topic.id }} lesson={state.text} enabled={done}>
        <div
          className="lesson-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            followRef.current = isNearBottom(event.currentTarget)
            updateActive()
          }}
        >
          <article
            className="lesson-body"
            data-testid="lesson-body"
            data-origin={done ? (state.fromCache ? 'cache' : 'generated') : undefined}
            aria-busy={running}
          >
            <LessonMarkdown markdown={state.text} sources={state.sources} streaming={running} />
          </article>
          {state.status === 'done' && <LessonSources sources={state.sources} />}
        </div>
      </LessonAsk>
    </section>
  )
}
