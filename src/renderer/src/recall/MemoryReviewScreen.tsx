import { useEffect, useId, useRef, useState } from 'react'
import type {
  MemoryReviewNotion,
  MemoryReviewView,
  RecallResult,
  RecallStart
} from '../../../shared/recall'
import type { TopicMasterySummary } from '../../../shared/mastery'
import './memoryReview.css'
import { attentionNotionIds, requestPractice } from './memoryReviewLogic'
import {
  emptyText,
  emptyTitle,
  footnoteText,
  lastSeenText,
  loadFailedText,
  missedOfText,
  noAttentionText,
  openTopicFailedText,
  practiceEmptyText,
  practiceFailedText,
  resultMarkLabel,
  startUnavailableText
} from './memoryReviewText'
import { RecallPlayer } from './RecallPlayer'
import { RecallResults } from './RecallResults'

/** What a Practice or an "Open the lesson section" was started for: one Notion, or the group. */
type Scope = number | 'all'

interface Notice {
  scope: Scope
  text: string
}

type Phase =
  | { name: 'list' }
  | { name: 'play'; start: RecallStart }
  | { name: 'results'; result: RecallResult }

const BACK_TO_REVIEW = 'Back to Memory review'

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="memory-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const CheckIcon = () => (
  <Icon>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </Icon>
)
const MinusIcon = () => (
  <Icon>
    <path d="M3.5 8h9" />
  </Icon>
)
const AttentionIcon = () => (
  <Icon>
    <path d="M8 3v6M8 12.5v.01" />
  </Icon>
)
const SteadierIcon = () => (
  <Icon>
    <path d="M2.5 11.5 6.5 7.5l2.5 2.5 4.5-5M10 5h3.5v3.5" />
  </Icon>
)
const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon>{open ? <path d="m4 6 4 4 4-4" /> : <path d="m6 4 4 4-4 4" />}</Icon>
)

/** The latest results as small marks: a check or a minus, each with its word as name. */
function ResultMarks({ results }: { results: boolean[] }) {
  return (
    <ol className="memory-results" aria-label="Latest results, oldest first">
      {results.map((correct, index) => (
        <li key={index}>
          <span
            role="img"
            aria-label={resultMarkLabel(correct)}
            className={`memory-mark memory-mark-${correct ? 'correct' : 'missed'}`}
          >
            {correct ? <CheckIcon /> : <MinusIcon />}
          </span>
        </li>
      ))}
    </ol>
  )
}

function NotionRow({
  entry,
  tone,
  now,
  busy,
  notice,
  onOpenSection,
  onPractice
}: {
  entry: MemoryReviewNotion
  tone: 'attention' | 'steady'
  now: Date
  busy: boolean
  notice: string | null
  onOpenSection: (entry: MemoryReviewNotion) => void
  onPractice: (entry: MemoryReviewNotion) => void
}) {
  const { notion } = entry
  return (
    <li className={`card memory-row memory-row-${tone}`} data-notion={notion.slug}>
      <div className="memory-row-head">
        <strong className="memory-row-title" lang="fr">
          {notion.title}
        </strong>
        <span className="chip">in {entry.topicTitle}</span>
      </div>
      <div className="memory-meta">
        <ResultMarks results={entry.lastResults} />
        <span className="label-mono">{missedOfText(entry.missed, entry.of)}</span>
        <span className="muted">{lastSeenText(entry.lastSeenAt, now)}</span>
      </div>
      <div className="memory-actions">
        <button
          type="button"
          className="btn-sm"
          data-testid="memory-open-section"
          aria-label={`Open the lesson section for ${notion.title}`}
          onClick={() => onOpenSection(entry)}
        >
          Open the lesson section
        </button>
        <button
          type="button"
          className="btn-sm"
          data-testid="memory-practice"
          aria-label={`Practice ${notion.title}`}
          aria-disabled={busy}
          onClick={() => {
            if (!busy) onPractice(entry)
          }}
        >
          Practice
        </button>
      </div>
      {notice && (
        <p className="notice notice-attention" role="status" data-testid="memory-notice">
          {notice}
        </p>
      )}
    </li>
  )
}

/** The load failed: honey, never red; the learner can retry or go back from the header. */
export function MemoryReviewLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="notice notice-attention memory-load-error"
      role="alert"
      data-testid="memory-error"
    >
      <p>{loadFailedText}</p>
      <button type="button" data-testid="memory-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

/**
 * The Memory Review of a loaded view: the three counts, "Start a recall quiz on these", the
 * groups (Needs attention, Getting steadier, Solid collapsed by default) and the footnote. Calm
 * by design: honey for attention, sage for the rest, never red; every status has an icon and a
 * word. A notion that is not tracked yet is in none of the groups.
 */
export function MemoryReviewContent({
  view,
  now = new Date(),
  starting = null,
  notice = null,
  solidOpen = false,
  onToggleSolid = () => {},
  onStart,
  onPractice,
  onOpenSection
}: {
  view: MemoryReviewView
  now?: Date
  /** The Practice being started: every Practice button waits for it. */
  starting?: Scope | null
  notice?: Notice | null
  /** Owned by the screen, so it survives a Practice (the content unmounts while it plays). */
  solidOpen?: boolean
  onToggleSolid?: () => void
  onStart: () => void
  onPractice: (entry: MemoryReviewNotion) => void
  onOpenSection: (entry: MemoryReviewNotion) => void
}) {
  const solidId = useId()
  const noteId = useId()

  if (view.tracked === 0) {
    return (
      <section className="card memory-empty" data-testid="memory-empty">
        <h2>{emptyTitle}</h2>
        <p>{emptyText}</p>
      </section>
    )
  }

  const { needs_attention: attention, steadier, solid } = view.groups
  const busy = starting !== null
  const noticeFor = (scope: Scope) => (notice?.scope === scope ? notice.text : null)
  const row = (entry: MemoryReviewNotion, tone: 'attention' | 'steady') => (
    <NotionRow
      key={entry.notion.id}
      entry={entry}
      tone={tone}
      now={now}
      busy={busy}
      notice={noticeFor(entry.notion.id)}
      onOpenSection={onOpenSection}
      onPractice={onPractice}
    />
  )

  return (
    <>
      <dl className="memory-strip" data-testid="memory-counts">
        <div className="card stat">
          <dt className="label-caps">Notions tracked</dt>
          <dd className="stat-value">{view.tracked}</dd>
        </div>
        <div className="card stat">
          <dt className="label-caps memory-stat-label memory-tone-attention">
            <AttentionIcon />
            Need attention
          </dt>
          <dd className="stat-value">{view.needsAttention}</dd>
        </div>
        <div className="card stat">
          <dt className="label-caps memory-stat-label memory-tone-steady">
            <SteadierIcon />
            Getting steadier
          </dt>
          <dd className="stat-value">{view.steadier}</dd>
        </div>
      </dl>

      <div className="memory-start">
        <button
          type="button"
          className="btn-primary"
          data-testid="memory-start"
          aria-disabled={attention.length === 0 || busy}
          aria-describedby={attention.length === 0 ? noteId : undefined}
          onClick={() => {
            if (attention.length > 0 && !busy) onStart()
          }}
        >
          {starting === 'all' ? 'Starting...' : 'Start a recall quiz on these'}
        </button>
        {attention.length === 0 && (
          <span id={noteId} className="dash-note" data-testid="memory-start-note">
            {startUnavailableText}
          </span>
        )}
        {noticeFor('all') && (
          <p className="notice notice-attention" role="status" data-testid="memory-notice">
            {noticeFor('all')}
          </p>
        )}
      </div>

      <section className="memory-group" aria-labelledby="memory-attention">
        <h2 id="memory-attention" className="memory-group-title memory-tone-attention">
          <AttentionIcon />
          Needs attention
          <span className="chip">{attention.length}</span>
        </h2>
        {attention.length === 0 ? (
          <p className="card dash-note">{noAttentionText}</p>
        ) : (
          <ul className="memory-list" data-testid="memory-group-needs-attention">
            {attention.map((entry) => row(entry, 'attention'))}
          </ul>
        )}
      </section>

      {steadier.length > 0 && (
        <section className="memory-group" aria-labelledby="memory-steadier">
          <h2 id="memory-steadier" className="memory-group-title memory-tone-steady">
            <SteadierIcon />
            Getting steadier
            <span className="chip">{steadier.length}</span>
          </h2>
          <ul className="memory-list" data-testid="memory-group-steadier">
            {steadier.map((entry) => row(entry, 'steady'))}
          </ul>
        </section>
      )}

      {solid.length > 0 && (
        <section className="memory-group">
          <h2 className="memory-group-title memory-tone-steady">
            <button
              type="button"
              className="btn-ghost memory-disclosure"
              data-testid="memory-solid-toggle"
              aria-expanded={solidOpen}
              aria-controls={solidId}
              onClick={onToggleSolid}
            >
              <ChevronIcon open={solidOpen} />
              <CheckIcon />
              Solid
              <span className="chip">{solid.length}</span>
            </button>
          </h2>
          <ul
            id={solidId}
            className="memory-list"
            data-testid="memory-group-solid"
            hidden={!solidOpen}
          >
            {solidOpen && solid.map((entry) => row(entry, 'steady'))}
          </ul>
        </section>
      )}

      <p className="dash-note memory-footnote" data-testid="memory-footnote">
        {footnoteText}
      </p>
    </>
  )
}

/**
 * The Memory Review: what is hard to remember, by Notion, and a way to practice it. Reached from
 * the Dashboard. A Practice is not a gate: it can be left at any time, never waits for a
 * Generation, and changes nothing of Mastery, XP, Levels, Badges, streak or Daily Goal.
 */
export function MemoryReviewScreen({
  onClose,
  onOpenTopic
}: {
  onClose: () => void
  onOpenTopic: (topic: TopicMasterySummary) => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'list' })
  const [view, setView] = useState<MemoryReviewView | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [solidOpen, setSolidOpen] = useState(false)
  const [starting, setStarting] = useState<Scope | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const inList = phase.name === 'list'
  // The Practice being played; a late completion of one the learner already left is ignored.
  const playing = useRef<number | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Loaded when the screen opens, on "Try again", and again each time the learner comes back from
  // a Practice.
  useEffect(() => {
    if (!inList) return
    heading.current?.focus()
    let active = true
    window.api
      .getMemoryReview()
      .then((loaded) => {
        if (!active) return
        setView(loaded)
        setFailed(false)
      })
      .catch((reason: unknown) => {
        console.warn('Could not load the Memory review:', reason)
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [inList, reloadKey])

  const practice = (notionIds: number[], scope: Scope) => {
    if (starting !== null) return
    setStarting(scope)
    setNotice(null)
    requestPractice((request) => window.api.startRecallPractice(request), notionIds)
      .then((request) => {
        if (request.kind === 'started') {
          playing.current = request.start.session.id
          setPhase({ name: 'play', start: request.start })
        } else {
          const text =
            request.kind === 'failed'
              ? practiceFailedText
              : practiceEmptyText(scope === 'all' ? 'notions' : 'notion')
          setNotice({ scope, text })
        }
      })
      .finally(() => setStarting(null))
  }

  /** Opens the Topic of the Notion (the Topic screen has no section anchor to open at). */
  const openSection = (entry: MemoryReviewNotion) => {
    setNotice(null)
    const fail = () => setNotice({ scope: entry.notion.id, text: openTopicFailedText })
    window.api
      .listMasteryTopics()
      .then((topics) => {
        const topic = topics.find((candidate) => candidate.slug === entry.topicSlug)
        if (!mounted.current) return
        if (topic) onOpenTopic(topic)
        else fail()
      })
      .catch(fail)
  }

  const retry = () => {
    setFailed(false)
    setReloadKey((key) => key + 1)
  }

  const backToReview = () => {
    playing.current = null
    setPhase({ name: 'list' })
  }

  if (phase.name !== 'list') {
    return (
      <main className="memory-screen" data-testid="memory-practice">
        <nav className="screen-nav">
          {phase.name === 'play' && (
            <button type="button" data-testid="memory-leave" onClick={backToReview}>
              {BACK_TO_REVIEW}
            </button>
          )}
          <h1>Recall Quiz</h1>
        </nav>
        {phase.name === 'play' ? (
          <RecallPlayer
            key={phase.start.session.id}
            start={phase.start}
            onCompleted={(result) => {
              if (playing.current === phase.start.session.id) setPhase({ name: 'results', result })
            }}
            onGiveUp={backToReview}
            giveUp={{ label: BACK_TO_REVIEW, hint: 'go back to Memory review' }}
          />
        ) : (
          <RecallResults
            result={phase.result}
            onContinue={backToReview}
            continueLabel={BACK_TO_REVIEW}
          />
        )}
      </main>
    )
  }

  return (
    <main className="memory-screen" data-testid="memory-review-screen">
      <header className="page-header">
        <h1 ref={heading} tabIndex={-1}>
          Memory review
        </h1>
        <button type="button" className="btn-sm" onClick={onClose} data-testid="memory-back">
          Dashboard
        </button>
      </header>
      {failed && <MemoryReviewLoadError onRetry={retry} />}
      {!view ? (
        !failed && <p>Loading the Memory review...</p>
      ) : (
        <MemoryReviewContent
          view={view}
          starting={starting}
          notice={notice}
          solidOpen={solidOpen}
          onToggleSolid={() => setSolidOpen(!solidOpen)}
          onStart={() => practice(attentionNotionIds(view), 'all')}
          onPractice={(entry) => practice([entry.notion.id], entry.notion.id)}
          onOpenSection={openSection}
        />
      )}
    </main>
  )
}
