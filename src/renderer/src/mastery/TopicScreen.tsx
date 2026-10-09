import { useCallback, useEffect, useRef, useState } from 'react'
import type { MasteryState, RemediationTarget } from '../../../shared/mastery'
import type { RoundResult, RoundStart } from '../../../shared/quiz'
import type { TopicSummary } from '../../../shared/topic'
import { LessonScreen } from '../lesson/LessonScreen'
import { errorTitle } from '../lesson/lessonState'
import { errorMessage } from '../quiz/errorMessage'
import { formatPercent } from '../quiz/progress'
import { QuizPlayer } from '../quiz/QuizPlayer'
import { QuizResults } from '../quiz/QuizResults'
import {
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
export function TopicScreen({ topic }: { topic: TopicSummary }) {
  const [state, setState] = useState<MasteryState | null>(null)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lessonDone, setLessonDone] = useState(false)
  // Bumped by Retry: remounts the lesson or a Remediation Lesson.
  const [attempt, setAttempt] = useState(0)
  const requestRef = useRef<{ id: string; ended: boolean } | null>(null)

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
      if (event.type === 'round_ready') return setOverlay({ name: 'play', start: event.start })
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
  }, [topic.id])

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

  if (!state) {
    return error ? <p role="alert">{error}</p> : <p>Loading the topic...</p>
  }

  return (
    <section className="mastery-topic" data-testid="mastery-topic">
      <header className="mastery-header">
        <h2>{state.topicTitle}</h2>
        <p className="mastery-progress" data-testid="mastery-progress">
          <span className={`mastery-badge mastery-${state.status}`} data-testid="mastery-status">
            {masteryLabels[state.status]}
          </span>{' '}
          {roundProgress(state)}
        </p>
        {error && (
          <p role="alert" className="lesson-error">
            {error}
          </p>
        )}
      </header>

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
            <button type="button" data-testid="mastery-continue" onClick={backToLoop} autoFocus>
              {overlay.result.round.passed ? 'Continue' : 'Continue to the Remediation Lessons'}
            </button>
          </p>
          <QuizResults result={overlay.result} />
        </div>
      )}

      {overlay === null && state.step.name === 'lesson' && (
        <>
          <LessonScreen
            key={attempt}
            topic={topic}
            onRetry={() => setAttempt((n) => n + 1)}
            onDone={() => setLessonDone(true)}
          />
          <footer className="mastery-footer">
            <button
              type="button"
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
        <p>Resuming round {state.roundNumber}...</p>
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
        <section className="mastery-scroll" data-testid="mastery-limit-reached">
          <h3>Round Limit reached</h3>
          <p>
            {state.failedRounds} rounds without reaching the Mastery Threshold (
            {state.masteryThreshold}%). Repeating the same explanation will not help: pick how to go
            on.
          </p>
          <div className="mastery-choices">
            <button
              type="button"
              data-testid="choose-another-angle"
              onClick={() => choose('another_angle')}
            >
              Try another angle
            </button>
            <span>New Remediation Lessons in a style you have not read yet, then a new round.</span>
            <button type="button" data-testid="choose-skip" onClick={() => choose('skip')}>
              Skip and come back later
            </button>
            <span>The topic stays marked as skipped; reopen it whenever you want.</span>
          </div>
        </section>
      )}
      {overlay === null && state.step.name === 'skipped' && (
        <section className="mastery-scroll" data-testid="mastery-skipped">
          <h3>Topic skipped</h3>
          <p>You chose to come back to this topic later.</p>
          <button
            type="button"
            data-testid="choose-come-back"
            onClick={() => choose('another_angle')}
          >
            Come back now with another angle
          </button>
        </section>
      )}
      {overlay === null && state.step.name === 'mastered' && (
        <section className="mastery-scroll" data-testid="mastery-mastered">
          <h3>Topic mastered</h3>
          <p>
            Round {state.lastRound?.number} passed with{' '}
            {formatPercent(state.lastRound?.scorePercent ?? 0)} (Mastery Threshold{' '}
            {state.masteryThreshold}%).
          </p>
        </section>
      )}
    </section>
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
      <div
        className={preparation.status === 'cancelled' ? 'lesson-notice' : 'lesson-error'}
        role="alert"
        data-testid="mastery-round-error"
      >
        <strong>
          {preparation.status === 'cancelled'
            ? 'Quiz preparation cancelled'
            : `The quiz could not be prepared: ${errorTitle(preparation.code)}`}
        </strong>
        {preparation.status === 'error' && <p>{preparation.message}</p>}
        <button type="button" onClick={onRetry} data-testid="mastery-round-retry">
          Retry
        </button>{' '}
        <button type="button" onClick={onBack}>
          Back
        </button>
      </div>
    )
  }
  return (
    <p className="lesson-status" role="status" data-testid="mastery-round-status">
      <span className="lesson-spinner" aria-hidden /> Round {roundNumber}:{' '}
      {preparationText[preparation.status]}{' '}
      <button type="button" onClick={onCancel} data-testid="mastery-round-cancel">
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
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      targets.findIndex((t) => !t.ready)
    )
  )
  const target = targets[index]!
  const allReady = targets.every((t) => t.ready)
  const last = state.lastRound

  return (
    <div className="mastery-scroll" data-testid="mastery-remediation">
      <p>
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
            {t.ready ? '✓ ' : ''}
            {t.notion.title} ({formatPercent(t.scorePercent)})
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
        )}{' '}
        <button
          type="button"
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
