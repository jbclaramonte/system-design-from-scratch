import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LessonReview } from '../../../shared/mastery'
import { GenerationErrorView } from '../generation/GenerationErrorView'
import { LessonMarkdown } from '../lesson/LessonMarkdown'
import { LessonSources } from '../lesson/LessonSources'
import { errorMessage } from '../quiz/errorMessage'
import { reviewTabs, selectedTab, type ReviewKey } from './lessonReview'

/**
 * The reading panel of the topic screen: the Lesson and the Remediation Lessons already
 * recorded, read from the database (`mastery:getLessonReview`, never a Generation). Mounted only
 * while open, so every opening shows what is recorded now. Escape closes it.
 */
export function LessonReviewPanel({ topicId, onClose }: { topicId: number; onClose: () => void }) {
  const [review, setReview] = useState<LessonReview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReviewKey | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let current = true
    window.api
      .getLessonReview({ topicId })
      .then((loaded) => current && setReview(loaded))
      .catch((reason: unknown) => current && setError(errorMessage(reason)))
    return () => {
      current = false
    }
  }, [topicId])

  // The focus moves into the panel, so Escape works at once and screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <LessonReviewView
      review={review}
      error={error}
      selected={selected}
      onSelect={setSelected}
      onClose={onClose}
      headingRef={headingRef}
    />
  )
}

/** The panel for a given review (separate from the loading, so it renders without IPC). */
export function LessonReviewView({
  review,
  error,
  selected,
  onSelect,
  onClose,
  headingRef
}: {
  review: LessonReview | null
  error: string | null
  selected: ReviewKey | null
  onSelect: (key: ReviewKey) => void
  onClose: () => void
  headingRef?: RefObject<HTMLHeadingElement | null>
}) {
  const tabs = review ? reviewTabs(review) : []
  const tab = selectedTab(tabs, selected)

  return (
    <section
      id="lesson-review"
      className="mastery-review"
      data-testid="lesson-review"
      aria-labelledby="lesson-review-title"
    >
      <header className="mastery-review-header">
        <h2 id="lesson-review-title" ref={headingRef} tabIndex={-1}>
          Lesson
        </h2>
        <button type="button" data-testid="lesson-review-close" onClick={onClose}>
          Close
        </button>
      </header>
      {error && <GenerationErrorView code="refused" message={error} testId="lesson-review-error" />}
      {!review && !error && (
        <p className="muted" role="status">
          Loading the Lesson...
        </p>
      )}
      {review && !tab && (
        <p className="muted" data-testid="lesson-review-empty">
          No Lesson is recorded for this topic yet.
        </p>
      )}
      {tab && tabs.length > 1 && (
        <nav className="mastery-targets" aria-label="Lessons" data-testid="lesson-review-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={t.key === tab.key}
              data-testid={`lesson-review-tab-${t.key.replace(':', '-')}`}
              onClick={() => onSelect(t.key)}
            >
              <span lang={t.kind === 'remediation' ? 'fr' : undefined}>{t.title}</span>
              {t.detail && <span className="label-mono muted">{t.detail}</span>}
            </button>
          ))}
        </nav>
      )}
      {tab && (
        <div className="lesson-scroll" key={tab.key}>
          <p className="lesson-badges">
            {tab.reading.grounded && (
              <span className="chip" title="Grounded on the System Design Primer">
                System Design Primer
              </span>
            )}
            {tab.detail && <span className="chip chip-progress">{tab.detail}</span>}
          </p>
          <article className="lesson-body" data-testid="lesson-review-body">
            <LessonMarkdown markdown={tab.reading.markdown} sources={tab.reading.sources} />
          </article>
          <LessonSources sources={tab.reading.sources} />
        </div>
      )}
    </section>
  )
}
