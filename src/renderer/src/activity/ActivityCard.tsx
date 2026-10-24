import { useEffect, useState } from 'react'
import type { ActivitySummary, ActivityWeekDay } from '../../../shared/activity'
import { errorMessage } from '../quiz/errorMessage'
import './activity.css'
import {
  goalDetail,
  goalPercent,
  goalValue,
  graceNote,
  streakDetail,
  streakHeadline,
  streakUnit,
  weekDayLabel,
  weekDayState,
  weekdayInitials,
  weekSummary,
  type WeekDayState
} from './activityText'

/**
 * The Activity Streak, the week strip and the Daily Goal, loaded on mount and again on every
 * `path:changed` push (sent after a completed Round). Nothing is stored: the main process derives
 * it from the Rounds and the Protocol Steps.
 */
function useActivity() {
  const [summary, setSummary] = useState<ActivitySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    const load = () =>
      window.api
        .getActivity()
        .then((next) => current && setSummary(next))
        .catch((reason: unknown) => current && setError(errorMessage(reason)))
    void load()
    const unsubscribe = window.api.onLearningPathChanged(() => void load())
    return () => {
      current = false
      unsubscribe()
    }
  }, [])
  return { summary, error }
}

/** The glyph of a day. Decorative: the text alternative says the state in words. */
function DayGlyph({ state }: { state: WeekDayState }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" className="activity-day-ring" />
      {state === 'done' && <path d="M6 10.5l2.8 2.8L14 7.5" className="activity-day-glyph" />}
      {state === 'grace' && <path d="M7 10h6" className="activity-day-glyph" />}
      {state === 'future' && (
        <path d="M7.5 9V7.7a2.5 2.5 0 015 0V9M7 9h6v4.5H7z" className="activity-day-glyph" />
      )}
    </svg>
  )
}

function WeekDay({ day }: { day: ActivityWeekDay }) {
  const state = weekDayState(day)
  return (
    <li
      className={`activity-day activity-day-${state}${day.isToday ? ' activity-day-current' : ''}`}
      aria-current={day.isToday ? 'date' : undefined}
      data-testid="activity-day"
      data-state={state}
    >
      <span className="activity-sr">{weekDayLabel(day)}</span>
      <span className="activity-day-initial" aria-hidden="true">
        {weekdayInitials[day.weekday]}
      </span>
      <DayGlyph state={state} />
    </li>
  )
}

/**
 * `side`: a compact card (the Learning Path, beside the progress). `wide`: the same content laid
 * out on one row (the Dashboard overview).
 */
export function ActivityCard({ variant = 'side' }: { variant?: 'side' | 'wide' }) {
  const { summary, error } = useActivity()
  if (error) {
    return (
      <p className="muted" role="status" data-testid="activity-error">
        Activity unavailable: {error}
      </p>
    )
  }
  if (!summary) return null
  const { goal } = summary
  const grace = graceNote(summary)
  const unit = streakUnit(summary)
  return (
    <section
      className={`card card-elevated activity activity-${variant}`}
      aria-labelledby={`activity-title-${variant}`}
      data-testid="activity-card"
    >
      <div className="activity-streak">
        <h2 id={`activity-title-${variant}`} className="label-caps">
          Streak
        </h2>
        <p className="activity-headline" data-testid="activity-streak">
          <strong className={unit ? 'activity-count' : 'activity-start'}>
            {streakHeadline(summary)}
          </strong>
          {unit && <span className="activity-unit">{unit}</span>}
        </p>
        <p className="activity-detail" data-testid="activity-streak-detail">
          {streakDetail(summary)}
        </p>
        {grace && (
          <p className="activity-detail" data-testid="activity-grace">
            {grace}
          </p>
        )}
      </div>
      <div className="activity-week-block">
        <ol
          className="activity-week"
          aria-label={`This week, Monday to Sunday. ${weekSummary(summary)}`}
          data-testid="activity-week"
        >
          {summary.week.map((day) => (
            <WeekDay key={day.date} day={day} />
          ))}
        </ol>
      </div>
      <div className="activity-goal">
        <h3 className="label-caps">Daily Goal</h3>
        <p className="activity-goal-value" data-testid="activity-goal">
          {goalValue(goal)}
          {goal.met && (
            <span className="chip chip-mastered chip-dot" data-testid="activity-goal-met">
              Met
            </span>
          )}
        </p>
        <div
          className={`progress${goal.met ? ' progress-complete' : ''}`}
          role="progressbar"
          aria-label="Daily Goal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={goalPercent(goal)}
          aria-valuetext={`${goalValue(goal)} today`}
        >
          <div className="progress-fill" style={{ width: `${goalPercent(goal)}%` }} />
        </div>
        <p className="activity-detail">{goalDetail(goal)}</p>
      </div>
    </section>
  )
}
