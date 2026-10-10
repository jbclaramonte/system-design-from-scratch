import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { MasteryState, RemediationTarget } from '../../../shared/mastery'
import type { RoundResult, RoundStart } from '../../../shared/quiz'
import type { TopicSummary } from '../../../shared/topic'
import { GenerationErrorView } from '../generation/GenerationErrorView'
import { generationErrorText } from '../generation/generationErrorText'
import { LessonScreen } from '../lesson/LessonScreen'
import { OutsidePrimerBadge } from '../lesson/OutsidePrimerBadge'
import { errorMessage } from '../quiz/errorMessage'
import { formatPercent } from '../quiz/progress'
import { QuizPlayer } from '../quiz/QuizPlayer'
import { QuizResults } from '../quiz/QuizResults'
import './mastery.css'
import { LessonReviewPanel } from './LessonReviewPanel'
import { canReviewLesson } from './lessonReview'
import {
  attemptsStat,
  firstRemediationIndex,
  masteryChip,
  masteryLabels,
  preparationText,
  roundPreparation,
  roundProgress,
  type RoundPreparation
} from './masteryText'
import { RemediationLesson } from './RemediationLesson'

/** Screens on top of the loop state: a round being prepared, played, or its results. */
type Overlay =
  | { name: 'preparing'; requestId: string; preparation: RoundPreparation }
  | { name: 'play'; start: RoundStart }
  | { name: 'results'; result: RoundResult }

/**
 * Drives a topic through the Mastery Loop: lesson, quiz round, results, Remediation Lessons on
 * the missed notions, next round... until mastered, with the Round Limit choice. The step comes
 * from the main process (derived from the database), so leaving and coming back resumes it.
 */
export function TopicScreen({
  topic,
  showTitle = true
}: {
  topic: TopicSummary
  /**
   * False when the enclosing screen already has the topic title as its heading (a topic opened
   * from the Learning Path). The dev "All topics" screen keeps it.
   */
  showTitle?: boolean
}) {
  const [state, setState] = useState<MasteryState | null>(null)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lessonDone, setLessonDone] = useState(false)
  // Bumped by Retry: remounts the lesson or a Remediation Lesson.
  const [attempt, setAttempt] = useState(0)
  const requestRef = useRef<{ id: string; ended: boolean } | null>(null)
  // The Lesson reading panel (#35). The step content stays mounted but hidden while it is open,
  // so the quiz keeps its question, choices and typed answer, and a Remediation Lesson keeps
  // streaming.
  const [reviewRequested, setReviewRequested] = useState(false)
  const reviewButtonRef = useRef<HTMLButtonElement>(null)
  const reviewWasOpen = useRef(false)

  /**
   * Reloads the loop state without changing the screen, so the header shows the status the main
   * process derives (in progress once the lesson is recorded or a round is opened).
   */
  const refreshState = useCallback(
    () =>
      window.api
        .getMasteryState({ topicId: topic.id })
        .then(setState)
        .catch((reason: unknown) => setError(errorMessage(reason))),
    [topic.id]
  )

  // Stable: the lesson screen calls it from an effect that depends on it.
  const lessonRecorded = useCallback(() => {
    setLessonDone(true)
    void refreshState()
  }, [refreshState])

  const startRound = useCallback(() => {
    const requestId = crypto.randomUUID()
    const request = { id: requestId, ended: false }
    requestRef.current = request
    setError(null)
    setOverlay({ name: 'preparing', requestId, preparation: { status: 'starting' } })
    const unsubscribe = window.api.onMasteryEvent(({ requestId: id, event }) => {
      if (id !== requestId) return
      if (event.type === 'round_ready' || event.type === 'error') {
        request.ended = true
        unsubscribe()
      }
      if (event.type === 'round_ready') {
        setOverlay({ name: 'play', start: event.start })
        return void refreshState()
      }
      setOverlay((current) =>
        current?.name === 'preparing' && current.requestId === requestId
          ? { ...current, preparation: roundPreparation(current.preparation, event) }
          : current
      )
    })
    window.api.startMasteryRound({ requestId, topicId: topic.id }).catch((reason: unknown) => {
      request.ended = true
      unsubscribe()
      setOverlay(null)
      setError(errorMessage(reason))
    })
  }, [topic.id, refreshState])

  /**
   * Reloads the loop state and shows its step. An open round (left mid-quiz, or after a
   * restart) is resumed right away.
   */
  const showLoop = useCallback(
    () =>
      window.api
        .getMasteryState({ topicId: topic.id })
        .then((next) => {
          setState(next)
          setOverlay(null)
          if (next.step.name === 'round') startRound()
        })
        .catch((reason: unknown) => setError(errorMessage(reason))),
    [topic.id, startRound]
  )

  useEffect(() => {
    void showLoop()
  }, [showLoop])

  // A round request still running when the screen closes is cancelled.
  useEffect(
    () => () => {
      const request = requestRef.current
      if (request && !request.ended) void window.api.cancelMastery({ requestId: request.id })
    },
    []
  )

  const choose = (choice: 'another_angle' | 'skip') => {
    setError(null)
    window.api
      .chooseAtRoundLimit({ topicId: topic.id, choice })
      .then(setState)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  const backToLoop = () => void showLoop()

  const canReview = state !== null && canReviewLesson(state, overlay?.name ?? null)
  const reviewOpen = reviewRequested && canReview
  const closeReview = useCallback(() => setReviewRequested(false), [])
  // Closing returns the focus to the Lesson button.
  useEffect(() => {
    if (reviewWasOpen.current && !reviewOpen) reviewButtonRef.current?.focus()
    reviewWasOpen.current = reviewOpen
  }, [reviewOpen])

  if (!state) {
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <p className="muted" role="status">
        Loading the topic...
      </p>
    )
  }

  return (
    <section className="mastery-topic" data-testid="mastery-topic">
      <TopicHeader
        state={state}
        grounded={topic.grounded}
        showTitle={showTitle}
        error={error}
        actions={
          canReview && (
            <LessonButton
              ref={reviewButtonRef}
              open={reviewOpen}
              onClick={() => setReviewRequested((open) => !open)}
            />
          )
        }
      />
      {reviewOpen && <LessonReviewPanel topicId={topic.id} onClose={closeReview} />}

      <div className="mastery-step" hidden={reviewOpen} data-testid="mastery-step">
        {overlay?.name === 'preparing' && (
          <Preparing
            preparation={overlay.preparation}
            roundNumber={state.roundNumber}
            onCancel={() => void window.api.cancelMastery({ requestId: overlay.requestId })}
            onRetry={startRound}
            onBack={backToLoop}
          />
        )}
        {overlay?.name === 'play' && (
          <div className="mastery-scroll">
            <QuizPlayer
              key={overlay.start.round.id}
              start={overlay.start}
              onCompleted={(result) => setOverlay({ name: 'results', result })}
            />
          </div>
        )}
        {overlay?.name === 'results' && (
          <div className="mastery-scroll">
            <p>
              <button
                type="button"
                className="btn-primary"
                data-testid="mastery-continue"
                onClick={backToLoop}
                autoFocus
              >
                {overlay.result.round.passed ? 'Continue' : 'Continue to the Remediation Lessons'}
              </button>
            </p>
            {/* The Outside the primer badge is already on the progress line. */}
            <QuizResults result={overlay.result} />
          </div>
        )}

        {overlay === null && state.step.name === 'lesson' && (
          <>
            <LessonScreen
              key={attempt}
              embedded
              topic={topic}
              onRetry={() => setAttempt((n) => n + 1)}
              onDone={lessonRecorded}
            />
            <footer className="mastery-footer">
              <button
                type="button"
                className="btn-primary"
                data-testid="mastery-start-round"
                disabled={!lessonDone && !state.step.lessonReady}
                onClick={startRound}
              >
                Take the quiz (round {state.roundNumber})
              </button>
            </footer>
          </>
        )}
        {overlay === null && state.step.name === 'round' && (
          <p className="muted" role="status">
            Resuming round {state.roundNumber}...
          </p>
        )}
        {overlay === null && state.step.name === 'remediation' && (
          <RemediationStep
            key={`${state.step.roundId}:${attempt}`}
            state={state}
            targets={state.step.targets}
            anotherAngle={state.step.anotherAngle}
            onLessonDone={backToLoop}
            onRetry={() => setAttempt((n) => n + 1)}
            onStartRound={startRound}
          />
        )}
        {overlay === null && state.step.name === 'limit_reached' && (
          <section
            className="mastery-outcome mastery-outcome-limit"
            data-testid="mastery-limit-reached"
          >
            <h3>Round Limit reached</h3>
            <p>
              {state.failedRounds} rounds without reaching the Mastery Threshold (
              {state.masteryThreshold}%). Repeating the same explanation will not help: pick how to
              go on.
            </p>
            <div className="mastery-choices">
              <div className="card card-elevated mastery-choice">
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="choose-another-angle"
                  onClick={() => choose('another_angle')}
                >
                  Try another angle
                </button>
                <p>New Remediation Lessons in a style you have not read yet, then a new round.</p>
              </div>
              <div className="card card-elevated mastery-choice">
                <button type="button" data-testid="choose-skip" onClick={() => choose('skip')}>
                  Skip and come back later
                </button>
                <p>The topic stays marked as skipped; reopen it whenever you want.</p>
              </div>
            </div>
          </section>
        )}
        {overlay === null && state.step.name === 'skipped' && (
          <section
            className="mastery-outcome mastery-outcome-skipped"
            data-testid="mastery-skipped"
          >
            <h3>Topic skipped</h3>
            <p>You chose to come back to this topic later.</p>
            <button
              type="button"
              className="btn-primary"
              data-testid="choose-come-back"
              onClick={() => choose('another_angle')}
            >
              Come back now with another angle
            </button>
          </section>
        )}
        {overlay === null && state.step.name === 'mastered' && (
          <section
            className="mastery-outcome mastery-outcome-mastered"
            data-testid="mastery-mastered"
          >
            <h3>Topic mastered</h3>
            <p>
              Round {state.lastRound?.number} passed with{' '}
              {formatPercent(state.lastRound?.scorePercent ?? 0)} (Mastery Threshold{' '}
              {state.masteryThreshold}%).
            </p>
          </section>
        )}
      </div>
    </section>
  )
}

/**
 * Opens the reading panel with the Lesson and the Remediation Lessons already recorded. Shown
 * from the moment a Lesson exists, in every step of the loop.
 */
function LessonButton({
  open,
  onClick,
  ref
}: {
  open: boolean
  onClick: () => void
  ref: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid="lesson-review-button"
      aria-expanded={open}
      aria-controls="lesson-review"
      title="Read the Lesson again without leaving the round"
      onClick={onClick}
    >
      Lesson
    </button>
  )
}

/**
 * Title (unless the enclosing screen shows it), then the progress line: mastery status, the
 * Outside the primer badge (the only one on the topic screen), round progress.
 */
export function TopicHeader({
  state,
  grounded,
  showTitle,
  error,
  actions
}: {
  state: MasteryState
  grounded: boolean
  showTitle: boolean
  error: string | null
  /** Buttons at the end of the progress line (the Lesson button). */
  actions?: ReactNode
}) {
  return (
    <header className="mastery-header">
      {showTitle && <h2>{state.topicTitle}</h2>}
      <div className="mastery-progress card" data-testid="mastery-progress">
        <div className="mastery-state">
          <div className="chip-row">
            <span className={masteryChip[state.status]} data-testid="mastery-status">
              {masteryLabels[state.status]}
            </span>
            {!grounded && <OutsidePrimerBadge testId="mastery-ungrounded" />}
          </div>
          <p className="mastery-summary">{roundProgress(state)}</p>
        </div>
        <RoundStats state={state} />
        {actions && <div className="mastery-actions">{actions}</div>}
      </div>
      {error && <GenerationErrorView code="refused" message={error} testId="mastery-error" />}
    </header>
  )
}

/**
 * The round indicator and what the loop knows about the rounds: the number of the round, failed
 * rounds against the Round Limit, the latest completed round, the Mastery Threshold.
 */
function RoundStats({ state }: { state: MasteryState }) {
  const attempts = attemptsStat(state)
  const last = state.lastRound
  const lastScore = last && last.completedAt !== null ? last.scorePercent : null
  return (
    <dl className="mastery-stats">
      <div className="stat mastery-stat" data-testid="mastery-round">
        <dt className="label-caps">Round</dt>
        <dd className="stat-value">{state.roundNumber}</dd>
      </div>
      {attempts && (
        <div className="stat mastery-stat" data-testid="mastery-attempts">
          <dt className="label-caps">Round Limit</dt>
          <dd>
            <span className="stat-value">
              {attempts.failedRounds} / {attempts.roundLimit}
            </span>{' '}
            <span className="label-mono muted">failed</span>
            <span
              className="progress mastery-attempts"
              data-exhausted={attempts.exhausted}
              aria-hidden
            >
              <span
                className="progress-fill mastery-attempts-fill"
                style={{ width: `${attempts.percent}%` }}
              />
            </span>
          </dd>
        </div>
      )}
      {last && lastScore !== null && (
        <div className="stat mastery-stat" data-testid="mastery-last-round">
          <dt className="label-caps">Round {last.number}</dt>
          <dd>
            <span className="stat-value">{formatPercent(lastScore)}</span>{' '}
            <span className={last.passed ? 'chip chip-mastered' : 'chip chip-attention'}>
              {last.passed ? 'Passed' : 'Not passed'}
            </span>
          </dd>
        </div>
      )}
      <div className="stat mastery-stat">
        <dt className="label-caps">Mastery Threshold</dt>
        <dd className="stat-value">{state.masteryThreshold}%</dd>
      </div>
    </dl>
  )
}

function Preparing({
  preparation,
  roundNumber,
  onCancel,
  onRetry,
  onBack
}: {
  preparation: RoundPreparation
  roundNumber: number
  onCancel: () => void
  onRetry: () => void
  onBack: () => void
}) {
  if (preparation.status === 'error' || preparation.status === 'cancelled') {
    return (
      <GenerationErrorView
        code={preparation.code}
        message={preparation.message}
        title={
          preparation.status === 'cancelled'
            ? 'Quiz preparation cancelled'
            : `The quiz could not be prepared: ${generationErrorText(preparation.code).title}`
        }
        onRetry={onRetry}
        retryTestId="mastery-round-retry"
        testId="mastery-round-error"
      >
        <button type="button" onClick={onBack}>
          Back
        </button>
      </GenerationErrorView>
    )
  }
  return (
    <p className="status-strip" role="status" data-testid="mastery-round-status">
      <span className="spinner" aria-hidden /> Round {roundNumber}:{' '}
      {preparationText[preparation.status]}{' '}
      <button
        type="button"
        className="btn-sm"
        onClick={onCancel}
        data-testid="mastery-round-cancel"
      >
        Cancel
      </button>
    </p>
  )
}

/** One Remediation Lesson per missed notion, one at a time, then the next round. */
function RemediationStep({
  state,
  targets,
  anotherAngle,
  onLessonDone,
  onRetry,
  onStartRound
}: {
  state: MasteryState
  targets: RemediationTarget[]
  anotherAngle: boolean
  onLessonDone: () => void
  onRetry: () => void
  onStartRound: () => void
}) {
  const [index, setIndex] = useState(() => firstRemediationIndex(targets) ?? 0)
  const target = targets[index]
  const allReady = targets.every((t) => t.ready)
  const last = state.lastRound

  if (!target) {
    return (
      <div className="mastery-scroll" data-testid="mastery-remediation-empty">
        <p>
          Round {last?.number} scored {formatPercent(last?.scorePercent ?? 0)}, below the Mastery
          Threshold ({state.masteryThreshold}%), but no missed notion was identified, so there is no
          Remediation Lesson to read. Retry the round with fresh questions.
        </p>
        <footer className="mastery-footer">
          <button
            type="button"
            className="btn-primary"
            data-testid="mastery-start-round"
            onClick={onStartRound}
          >
            Retry: start round {state.roundNumber}
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div className="mastery-scroll" data-testid="mastery-remediation">
      <p className="mastery-intro">
        {anotherAngle ? 'Another angle: ' : ''}Round {last?.number} scored{' '}
        {formatPercent(last?.scorePercent ?? 0)}, below the Mastery Threshold (
        {state.masteryThreshold}%). One short Remediation Lesson per missed notion, then a new round
        with fresh questions.
      </p>
      <nav className="mastery-targets" aria-label="Missed notions">
        {targets.map((t, i) => (
          <button
            key={t.notion.id}
            type="button"
            lang="fr"
            aria-current={i === index}
            data-ready={String(t.ready)}
            onClick={() => setIndex(i)}
          >
            {t.ready && <span title="Remediation Lesson ready">✓</span>}
            <span>{t.notion.title}</span>
            <span className="label-mono muted">{formatPercent(t.scorePercent)}</span>
          </button>
        ))}
      </nav>
      <RemediationLesson
        key={target.notion.id}
        topicId={state.topicId}
        target={target}
        onDone={onLessonDone}
        onRetry={onRetry}
      />
      <footer className="mastery-footer">
        {index < targets.length - 1 && (
          <button type="button" data-testid="remediation-next" onClick={() => setIndex(index + 1)}>
            Next notion
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          data-testid="mastery-start-round"
          disabled={!allReady}
          onClick={onStartRound}
        >
          Start round {state.roundNumber}
        </button>
      </footer>
    </div>
  )
}
