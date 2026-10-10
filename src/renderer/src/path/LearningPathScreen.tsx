import { useEffect, useState } from 'react'
import {
  learningPathSections,
  type DesignExerciseStep,
  type LearningPath,
  type LearningPathStep,
  type LearningPathStepStatus,
  type TopicStep
} from '../../../shared/learningPath'
import type { TopicMasterySummary } from '../../../shared/mastery'
import { errorMessage } from '../quiz/errorMessage'
import './path.css'
import {
  actionLabel,
  canOpenExercise,
  continueLabel,
  filteredSections,
  lockMessage,
  noNextStepText,
  pathFilterLabels,
  pathFilters,
  prerequisiteText,
  priorityDetails,
  progressText,
  recommendedStep,
  sectionCounter,
  sectionTitles,
  statusChipVariant,
  statusLabel,
  statusNote,
  stepTitle,
  topicCounters,
  topicStepBySlug,
  type PathFilter
} from './pathText'

type OpenTopic = (topic: TopicMasterySummary) => void
/** Opens a Design Exercise (`design_exercises.id`). */
type OpenExercise = (designExerciseId: number) => void

const chipClass = (status: LearningPathStepStatus): string => {
  const variant = statusChipVariant[status]
  return `chip chip-dot${variant === 'neutral' ? '' : ` chip-${variant}`}`
}

function StatusChip({ step, testId }: { step: LearningPathStep; testId?: string }) {
  return (
    <span className={chipClass(step.status)} data-testid={testId}>
      {statusLabel(step)}
    </span>
  )
}

/** The circle before a title. Decorative: the status chip carries the status in words. */
function StatusMark({ status }: { status: LearningPathStepStatus }) {
  return (
    <span className={`path-mark path-mark-${statusChipVariant[status]}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none">
        <circle cx="10" cy="10" r="9" className="path-mark-ring" />
        {(status === 'mastered' || status === 'completed') && (
          <path d="M6 10.5l2.8 2.8L14 7.5" className="path-mark-glyph" />
        )}
        {status === 'in_progress' && <circle cx="10" cy="10" r="3" className="path-mark-dot" />}
        {status === 'limit_reached' && <path d="M10 6v5M10 13.4v.1" className="path-mark-glyph" />}
        {status === 'skipped' && <path d="M7 10h6" className="path-mark-glyph" />}
        {status === 'locked' && (
          <path
            d="M7.5 9V7.7a2.5 2.5 0 015 0V9M7 9h6v4.5H7z"
            className="path-mark-glyph path-mark-lock"
          />
        )}
      </svg>
    </span>
  )
}

function TopicStepItem({
  step,
  path,
  recommended,
  onOpenTopic
}: {
  step: TopicStep
  path: LearningPath
  recommended: boolean
  onOpenTopic: OpenTopic
}) {
  const lock = lockMessage(step)
  const note = statusNote(step)
  // A lock message names the topic to master: offer to open it unless it is locked too.
  const blocker = step.lockedBy && topicStepBySlug(path, step.lockedBy.slug)
  const title = (
    <>
      <StatusMark status={step.status} />
      <span className="path-step-title">{step.topic.title}</span>
      <span className="path-step-chips">
        {!step.topic.grounded && (
          <span
            className="chip chip-attention"
            title="Foundations Module: generated from general knowledge, not checked against the primer"
          >
            Outside the primer
          </span>
        )}
        <StatusChip step={step} testId="path-status" />
      </span>
    </>
  )
  return (
    <li
      className={`card path-step path-step-${step.status}`}
      data-step={step.key}
      aria-current={recommended ? 'step' : undefined}
    >
      {step.status === 'locked' ? (
        <div className="path-step-row" aria-disabled="true">
          {title}
        </div>
      ) : (
        <button type="button" className="path-step-row" onClick={() => onOpenTopic(step.topic)}>
          {title}
        </button>
      )}
      {lock && (
        <p className="path-step-note" data-testid="path-lock-message">
          <span>{lock}</span>
          {blocker && blocker.status !== 'locked' && blocker.status !== 'mastered' && (
            <button type="button" className="btn btn-sm" onClick={() => onOpenTopic(blocker.topic)}>
              Go to {blocker.topic.title}
            </button>
          )}
        </p>
      )}
      {note && (
        <p className="path-step-note" data-testid="path-status-note">
          <span>{note}</span>
        </p>
      )}
    </li>
  )
}

function ExerciseStepItem({
  step,
  recommended,
  onOpenExercise
}: {
  step: DesignExerciseStep
  recommended: boolean
  onOpenExercise: OpenExercise
}) {
  const lock = lockMessage(step)
  const id = canOpenExercise(step) ? step.designExerciseId : null
  const prerequisites = prerequisiteText(step)
  const title = (
    <>
      <span className="path-step-title">{step.title}</span>
      <span className="path-step-chips">
        <StatusChip step={step} testId="path-status" />
      </span>
    </>
  )
  return (
    <li
      className={`card path-step path-exercise path-step-${step.status}`}
      data-step={step.key}
      aria-current={recommended ? 'step' : undefined}
    >
      {id !== null ? (
        <button type="button" className="path-step-row" onClick={() => onOpenExercise(id)}>
          {title}
        </button>
      ) : (
        <div className="path-step-row" aria-disabled="true">
          {title}
        </div>
      )}
      {prerequisites && <p className="label-mono path-prerequisites">{prerequisites}</p>}
      {(lock || !prerequisites) && (
        <p className="path-step-note" data-testid={lock ? 'path-lock-message' : undefined}>
          <span>{lock ?? 'Prerequisites mastered.'}</span>
        </p>
      )}
      <p className="path-rationale">{step.rationale}</p>
    </li>
  )
}

/** The hero card: mastered topics of all topics, the percentage, the bar and the counters. */
function ProgressHero({ path }: { path: LearningPath }) {
  const { masteredTopics, totalTopics, percent } = path.progress
  const counters = topicCounters(path)
  const items = [
    { key: 'mastered', label: 'Mastered', value: counters.mastered },
    { key: 'progress', label: 'In progress', value: counters.inProgress },
    {
      key: 'error',
      label: 'Retry required',
      value: counters.retryRequired,
      hint: 'Topics at the Round Limit'
    },
    { key: 'locked', label: 'Locked', value: counters.locked }
  ]
  return (
    <section className="card card-elevated path-hero" aria-labelledby="path-hero-label">
      <div className="path-hero-head">
        <div>
          <h2 id="path-hero-label" className="label-caps">
            Overall progress
          </h2>
          <p className="path-hero-count" data-testid="path-progress-text">
            <strong>{masteredTopics}</strong>
            <span className="path-hero-total"> / {totalTopics}</span>
            <span className="path-hero-unit">topics mastered</span>
          </p>
        </div>
        <p className="path-hero-percent">{percent}%</p>
      </div>
      <div
        className={`progress${percent === 100 ? ' progress-complete' : ''}`}
        role="progressbar"
        aria-label={progressText(path.progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <dl className="path-counters">
        {items.map((item) => (
          <div key={item.key} className="path-counter" title={item.hint}>
            <dt className={`label-caps path-counter-label path-counter-${item.key}`}>
              {item.label}
            </dt>
            <dd className="path-counter-value">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The recommended next step with its call to action. */
function CurrentPriority({
  path,
  onOpenTopic,
  onOpenExercise
}: {
  path: LearningPath
  onOpenTopic: OpenTopic
  onOpenExercise: OpenExercise
}) {
  const next = recommendedStep(path)
  const actionable = next && (next.kind === 'topic' || next.designExerciseId !== null)
  return (
    <section className="card card-elevated path-priority" aria-labelledby="path-priority-label">
      <h2 id="path-priority-label" className="label-caps">
        Current priority
      </h2>
      {next && actionable ? (
        <div className="path-priority-body">
          <div className="path-priority-text">
            <p className="path-priority-title">{stepTitle(next)}</p>
            <p className="path-priority-details muted">{priorityDetails(next).join(' · ')}</p>
          </div>
          <StatusChip step={next} />
          <button
            type="button"
            className="btn btn-primary"
            data-testid="path-continue"
            aria-label={continueLabel(next)}
            onClick={() =>
              next.kind === 'topic'
                ? onOpenTopic(next.topic)
                : onOpenExercise(next.designExerciseId!)
            }
          >
            {actionLabel(next)}
          </button>
        </div>
      ) : (
        <p className="path-priority-title" data-testid="path-no-next">
          {next ? stepTitle(next) : noNextStepText(path)}
        </p>
      )}
    </section>
  )
}

/**
 * The home screen: the Learning Path with its progress, the recommended step, a filter and
 * its sections, the status of each step. Reloaded on mount and on every `path:changed` push.
 */
export function LearningPathScreen({
  onOpenTopic,
  onOpenExercise
}: {
  onOpenTopic: OpenTopic
  onOpenExercise: OpenExercise
}) {
  const [path, setPath] = useState<LearningPath | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<PathFilter>('all')

  useEffect(() => {
    const unsubscribe = window.api.onLearningPathChanged(setPath)
    window.api
      .getLearningPath()
      .then(setPath)
      .catch((reason: unknown) => setError(errorMessage(reason)))
    return unsubscribe
  }, [])

  const heading = (
    <header className="path-header">
      <h1>Learning Path</h1>
      <p className="muted">
        Foundations, primer topics and Design Exercises: each step unlocks once the previous one is
        mastered.
      </p>
    </header>
  )
  if (error) {
    return (
      <div className="path-screen">
        {heading}
        <p role="alert">Could not load the Learning Path: {error}</p>
      </div>
    )
  }
  if (!path) {
    return (
      <div className="path-screen">
        {heading}
        <p>Loading the Learning Path...</p>
      </div>
    )
  }

  const shown = filteredSections(filter)
  return (
    <div className="path-screen" data-testid="learning-path">
      {heading}
      <div className="path-overview">
        <ProgressHero path={path} />
        <CurrentPriority path={path} onOpenTopic={onOpenTopic} onOpenExercise={onOpenExercise} />
      </div>
      <div className="path-filters" role="group" aria-label="Filter the Learning Path">
        {pathFilters.map((value) => (
          <button
            key={value}
            type="button"
            className="path-filter"
            aria-pressed={filter === value}
            data-testid={`path-filter-${value}`}
            onClick={() => setFilter(value)}
          >
            {pathFilterLabels[value]}
          </button>
        ))}
      </div>
      {learningPathSections.map((section) => {
        const steps = path.steps.filter((step) => step.section === section)
        if (steps.length === 0 || !shown.includes(section)) return null
        return (
          <section key={section} className="path-section" aria-labelledby={`path-${section}`}>
            <div className="path-section-head">
              <h2 id={`path-${section}`}>{sectionTitles[section]}</h2>
              <p className="label-mono muted" data-testid={`path-counter-${section}`}>
                {sectionCounter(path, section)}
              </p>
            </div>
            <ol className={`path-steps${section === 'design_exercises' ? ' path-steps-grid' : ''}`}>
              {steps.map((step) =>
                step.kind === 'topic' ? (
                  <TopicStepItem
                    key={step.key}
                    step={step}
                    path={path}
                    recommended={step.key === path.nextStepKey}
                    onOpenTopic={onOpenTopic}
                  />
                ) : (
                  <ExerciseStepItem
                    key={step.key}
                    step={step}
                    recommended={step.key === path.nextStepKey}
                    onOpenExercise={onOpenExercise}
                  />
                )
              )}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
