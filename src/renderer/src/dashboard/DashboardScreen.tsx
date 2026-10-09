import { useEffect, useId, useRef, useState } from 'react'
import type { Dashboard, DashboardTopic, HistoryRound, WeakPoint } from '../../../shared/dashboard'
import type { TopicStep } from '../../../shared/learningPath'
import type { TopicMasterySummary } from '../../../shared/mastery'
import '../path/path.css'
import { stepStatusLabels } from '../path/pathText'
import { errorMessage } from '../quiz/errorMessage'
import './dashboard.css'
import {
  isEmptyDashboard,
  notionProgress,
  percentOrDash,
  practiceState,
  questionTypeLabels,
  resultLabels,
  roundLimitText,
  roundStatusLabels,
  timeSince
} from './dashboardText'
import { HeatLegend, NotionMapGrid } from './NotionMap'

type OpenTopic = (topic: TopicMasterySummary) => void

/** Weak points shown before "Show all". */
const WEAK_POINTS_SHOWN = 8

const formatDate = (iso: string) => new Date(iso).toLocaleString()

/**
 * Opens the topic in the Mastery Loop, like the Learning Path. A locked topic keeps a focusable
 * button marked disabled, with the lock reason as its description.
 */
function PracticeButton({ step, onOpenTopic }: { step: TopicStep; onOpenTopic: OpenTopic }) {
  const reasonId = useId()
  const state = practiceState(step)
  if (state.enabled) {
    return (
      <button
        type="button"
        data-testid="practice"
        aria-label={`Practice ${step.topic.title}`}
        onClick={() => onOpenTopic(step.topic)}
      >
        Practice
      </button>
    )
  }
  return (
    <span className="dash-practice-locked">
      <button
        type="button"
        data-testid="practice"
        aria-disabled="true"
        aria-label={`Practice ${step.topic.title} (locked)`}
        aria-describedby={reasonId}
      >
        Practice
      </button>{' '}
      <span id={reasonId} className="dash-note" data-testid="practice-lock-reason">
        Locked. {state.reason}
      </span>
    </span>
  )
}

function Overview({ dashboard }: { dashboard: Dashboard }) {
  const { overview } = dashboard
  const cards = [
    {
      label: 'Learning Path',
      value: `${overview.masteredTopics} of ${overview.totalTopics}`,
      detail: `topics mastered (${overview.percent}%)`
    },
    {
      label: 'Rounds',
      value: String(overview.roundsCompleted),
      detail:
        overview.roundsInProgress > 0
          ? `completed, ${overview.roundsInProgress} in progress`
          : 'completed'
    },
    { label: 'Attempts', value: String(overview.attemptCount), detail: 'answers recorded' },
    {
      label: 'Accuracy',
      value: percentOrDash(overview.accuracyPercent),
      detail: 'of all attempts correct'
    },
    {
      label: 'Last activity',
      value: timeSince(overview.lastActivityAt),
      detail: overview.lastActivityAt ? formatDate(overview.lastActivityAt) : ''
    }
  ]
  return (
    <section aria-labelledby="dash-overview">
      <h2 id="dash-overview">Overview</h2>
      <dl className="dash-cards" data-testid="dashboard-overview">
        {cards.map((card) => (
          <div key={card.label} className="dash-card">
            <dt>{card.label}</dt>
            <dd className="dash-card-value">{card.value}</dd>
            <dd className="dash-card-detail">{card.detail}</dd>
          </div>
        ))}
      </dl>
      <p className="dash-note">
        Mastery Threshold {dashboard.masteryThreshold}%: notions are judged against it today; each
        round keeps the result it got when it was completed.
      </p>
    </section>
  )
}

function WeakPoints({
  weakPoints,
  steps,
  onOpenTopic
}: {
  weakPoints: WeakPoint[]
  steps: Map<number, TopicStep>
  onOpenTopic: OpenTopic
}) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? weakPoints : weakPoints.slice(0, WEAK_POINTS_SHOWN)
  return (
    <section aria-labelledby="dash-weak">
      <h2 id="dash-weak">Weak points</h2>
      {weakPoints.length === 0 ? (
        <p className="dash-note">
          No weak point: every notion tested so far meets the Mastery Threshold.
        </p>
      ) : (
        <>
          <p className="dash-note">
            Notions whose latest score is below the Mastery Threshold, lowest score first.
          </p>
          <ol className="dash-weak-list" data-testid="weak-points">
            {shown.map((weak) => {
              const step = steps.get(weak.topicId)
              return (
                <li key={weak.notion.id} className="dash-weak">
                  <div className="dash-weak-row">
                    <div>
                      <strong>{weak.notion.title}</strong>{' '}
                      <span className="dash-note">in {weak.topicTitle}</span>
                      <div className="dash-weak-reason">
                        Latest {percentOrDash(weak.notion.latestScorePercent)}. {weak.reason}.
                      </div>
                    </div>
                    {step && <PracticeButton step={step} onOpenTopic={onOpenTopic} />}
                  </div>
                </li>
              )
            })}
          </ol>
          {weakPoints.length > WEAK_POINTS_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${weakPoints.length} weak points`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function TopicRow({ topic, onOpenTopic }: { topic: DashboardTopic; onOpenTopic: OpenTopic }) {
  const progress = notionProgress(topic)
  const { step } = topic
  return (
    <tr data-topic={step.topic.slug}>
      <th scope="row">{step.topic.title}</th>
      <td>
        <span className={`path-badge path-${step.status}`}>{stepStatusLabels[step.status]}</span>
      </td>
      <td>
        {topic.notionCount === 0 ? (
          <span className="dash-note">No Notion Outline yet</span>
        ) : (
          <div className="dash-progress-cell">
            <div
              className="dash-progress"
              role="progressbar"
              aria-label={`Notions mastered in ${step.topic.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={`${topic.notionsMastered} of ${topic.notionCount} notions mastered`}
            >
              <div className="dash-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span>
              {topic.notionsMastered}/{topic.notionCount}
            </span>
          </div>
        )}
      </td>
      <td>
        {topic.rounds.length === 0 ? (
          '–'
        ) : (
          <details>
            <summary>
              {topic.rounds.length} round{topic.rounds.length === 1 ? '' : 's'}
            </summary>
            <ol className="dash-rounds">
              {topic.rounds.map((round) => (
                <li key={round.id}>
                  Round {round.number}: {roundStatusLabels[round.status]}
                  {round.scorePercent !== null && `, ${percentOrDash(round.scorePercent)}`},{' '}
                  {formatDate(round.completedAt ?? round.startedAt)}
                </li>
              ))}
            </ol>
          </details>
        )}
      </td>
      <td>{percentOrDash(topic.bestScorePercent)}</td>
      <td>{percentOrDash(topic.latestScorePercent)}</td>
      <td>{topic.rounds.length === 0 ? '–' : roundLimitText(topic)}</td>
      <td>{timeSince(topic.lastPracticedAt)}</td>
      <td>
        <PracticeButton step={step} onOpenTopic={onOpenTopic} />
      </td>
    </tr>
  )
}

function TopicsTable({
  topics,
  onOpenTopic
}: {
  topics: DashboardTopic[]
  onOpenTopic: OpenTopic
}) {
  return (
    <section aria-labelledby="dash-topics">
      <h2 id="dash-topics">Topics</h2>
      <div className="dash-table-wrap">
        <table className="dash-table" data-testid="dashboard-topics">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Status</th>
              <th scope="col">Notions mastered</th>
              <th scope="col">Rounds</th>
              <th scope="col">Best</th>
              <th scope="col">Latest</th>
              <th scope="col">Round Limit</th>
              <th scope="col">Last practiced</th>
              <th scope="col">
                <span className="dash-visually-hidden">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <TopicRow key={topic.step.key} topic={topic} onOpenTopic={onOpenTopic} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HistoryRoundItem({ round }: { round: HistoryRound }) {
  return (
    <li className="dash-history-round">
      <details>
        <summary>
          {round.topicTitle}, round {round.number}: {roundStatusLabels[round.status]}
          {round.scorePercent !== null && `, ${percentOrDash(round.scorePercent)}`} (
          {formatDate(round.startedAt)}, {round.attempts.length} attempt
          {round.attempts.length === 1 ? '' : 's'})
        </summary>
        {round.attempts.length === 0 ? (
          <p className="dash-note">No answer recorded yet.</p>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Type</th>
                <th scope="col">Result</th>
                <th scope="col">Notions</th>
                <th scope="col">Answered</th>
              </tr>
            </thead>
            <tbody>
              {round.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td lang="fr">{attempt.prompt}</td>
                  <td>{questionTypeLabels[attempt.questionType]}</td>
                  <td className={`dash-result-${attempt.result}`}>
                    {resultLabels[attempt.result]}
                    {attempt.contested && (
                      <span className="dash-note"> (contested, re-graded)</span>
                    )}
                  </td>
                  <td lang="fr">{attempt.notions.map((notion) => notion.title).join(', ')}</td>
                  <td>{formatDate(attempt.attemptedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </li>
  )
}

function History({
  dashboard,
  topicFilter,
  onFilter
}: {
  dashboard: Dashboard
  topicFilter: number | null
  onFilter: (topicId: number | null) => void
}) {
  const practiced = dashboard.topics.filter((topic) => topic.rounds.length > 0)
  return (
    <section aria-labelledby="dash-history">
      <h2 id="dash-history">Attempt history</h2>
      <label className="dash-filter">
        Topic{' '}
        <select
          data-testid="history-filter"
          value={topicFilter ?? ''}
          onChange={(event) => onFilter(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">All topics</option>
          {practiced.map((topic) => (
            <option key={topic.step.topic.id} value={topic.step.topic.id}>
              {topic.step.topic.title}
            </option>
          ))}
        </select>
      </label>
      {dashboard.history.length === 0 ? (
        <p className="dash-note">No round on this topic yet.</p>
      ) : (
        <ol className="dash-history" data-testid="history">
          {dashboard.history.map((round) => (
            <HistoryRoundItem key={round.id} round={round} />
          ))}
        </ol>
      )}
    </section>
  )
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <section className="dash-empty" data-testid="dashboard-empty" aria-labelledby="dash-empty">
      <h2 id="dash-empty">Nothing to show yet</h2>
      <p>
        Take your first quiz on the Learning Path. Once a round is played, this Dashboard shows:
      </p>
      <ul>
        <li>your progress on the Learning Path, rounds, attempts and accuracy;</li>
        <li>the mastery of each topic, with its rounds and the Round Limit;</li>
        <li>the Notion Map: the latest score of every notion, as a heat grid;</li>
        <li>your weak points, with a button to practice them;</li>
        <li>the history of your rounds and answers.</li>
      </ul>
      <button type="button" onClick={onClose} data-testid="dashboard-to-path">
        Go to the Learning Path
      </button>
    </section>
  )
}

/**
 * The Dashboard: overview, weak points, the Notion Map, topics and the attempt history. Loaded on
 * mount and on every `path:changed` push (a completed round, a Round Limit choice); the topic
 * filter reloads the history.
 */
export function DashboardScreen({
  onClose,
  onOpenTopic
}: {
  onClose: () => void
  onOpenTopic: OpenTopic
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [topicFilter, setTopicFilter] = useState<number | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => heading.current?.focus(), [])

  useEffect(() => {
    let active = true
    const load = () => {
      window.api
        .getDashboard(topicFilter === null ? {} : { topicId: topicFilter })
        .then((loaded) => {
          if (!active) return
          setDashboard(loaded)
          setError(null)
        })
        .catch((reason: unknown) => {
          if (active) setError(errorMessage(reason))
        })
    }
    load()
    const unsubscribe = window.api.onLearningPathChanged(load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [topicFilter])

  const steps = new Map(dashboard?.topics.map((topic) => [topic.step.topic.id, topic.step]))

  return (
    <main className="dash-screen" data-testid="dashboard-screen">
      <header className="dash-header">
        <button type="button" onClick={onClose} data-testid="dashboard-back">
          Learning Path
        </button>
        <h1 ref={heading} tabIndex={-1}>
          Dashboard
        </h1>
      </header>
      {error && <p role="alert">Could not load the Dashboard: {error}</p>}
      {!dashboard ? (
        !error && <p>Loading the Dashboard...</p>
      ) : isEmptyDashboard(dashboard) ? (
        <EmptyState onClose={onClose} />
      ) : (
        <>
          <Overview dashboard={dashboard} />
          <WeakPoints weakPoints={dashboard.weakPoints} steps={steps} onOpenTopic={onOpenTopic} />
          <section aria-labelledby="dash-map">
            <h2 id="dash-map">Notion Map</h2>
            <p className="dash-note">
              Latest score of each notion, from the most recent completed round that tested it.
              Select a notion for its details.
            </p>
            <HeatLegend threshold={dashboard.masteryThreshold} />
            {dashboard.notionMap.map((map) => (
              <NotionMapGrid key={map.topicId} map={map} />
            ))}
          </section>
          <TopicsTable topics={dashboard.topics} onOpenTopic={onOpenTopic} />
          <History dashboard={dashboard} topicFilter={topicFilter} onFilter={setTopicFilter} />
        </>
      )}
    </main>
  )
}
