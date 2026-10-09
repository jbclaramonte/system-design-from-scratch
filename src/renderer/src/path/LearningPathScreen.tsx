import { useEffect, useState } from 'react'
import {
  learningPathSections,
  type DesignExerciseStep,
  type LearningPath,
  type LearningPathStep,
  type TopicStep
} from '../../../shared/learningPath'
import type { TopicMasterySummary } from '../../../shared/mastery'
import { OutsidePrimerBadge } from '../lesson/OutsidePrimerBadge'
import { errorMessage } from '../quiz/errorMessage'
import './path.css'
import {
  canOpenExercise,
  continueLabel,
  lockMessage,
  noNextStepText,
  progressText,
  recommendedStep,
  sectionTitles,
  stepStatusLabels,
  stepTitle,
  topicStepBySlug
} from './pathText'

type OpenTopic = (topic: TopicMasterySummary) => void
/** Opens a Design Exercise (`design_exercises.id`). */
type OpenExercise = (designExerciseId: number) => void

function StatusBadge({ step }: { step: LearningPathStep }) {
  return (
    <span className={`path-badge path-${step.status}`} data-testid="path-status">
      {stepStatusLabels[step.status]}
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
  // A lock message names the topic to master: offer to open it unless it is locked too.
  const blocker = step.lockedBy && topicStepBySlug(path, step.lockedBy.slug)
  const title = (
    <>
      <span className="path-step-title">{step.topic.title}</span>
      {!step.topic.grounded && <OutsidePrimerBadge />}
      <StatusBadge step={step} />
    </>
  )
  return (
    <li
      className={`path-step path-step-${step.status}`}
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
          {lock}{' '}
          {blocker && blocker.status !== 'locked' && blocker.status !== 'mastered' && (
            <button type="button" onClick={() => onOpenTopic(blocker.topic)}>
              Go to {blocker.topic.title}
            </button>
          )}
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
  const title = (
    <>
      <span className="path-step-title">{step.title}</span>
      <StatusBadge step={step} />
    </>
  )
  return (
    <li
      className={`path-step path-step-${step.status}`}
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
      <p className="path-step-note" data-testid={lock ? 'path-lock-message' : undefined}>
        {lock ?? 'Prerequisites mastered.'} <span className="path-rationale">{step.rationale}</span>
      </p>
    </li>
  )
}

/**
 * The home screen: the Learning Path with its sections, the status of each step, the
 * recommended step and the progress. Reloaded on mount and on every `path:changed` push.
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

  useEffect(() => {
    const unsubscribe = window.api.onLearningPathChanged(setPath)
    window.api
      .getLearningPath()
      .then(setPath)
      .catch((reason: unknown) => setError(errorMessage(reason)))
    return unsubscribe
  }, [])

  if (error) return <p role="alert">Could not load the Learning Path: {error}</p>
  if (!path) return <p>Loading the Learning Path...</p>

  const next = recommendedStep(path)
  return (
    <div className="path-screen" data-testid="learning-path">
      <section className="path-summary" aria-label="Progress">
        <p id="path-progress-label">{progressText(path.progress)}</p>
        <div
          className="path-progress"
          role="progressbar"
          aria-labelledby="path-progress-label"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={path.progress.percent}
        >
          <div className="path-progress-fill" style={{ width: `${path.progress.percent}%` }} />
        </div>
        {next && (next.kind === 'topic' || next.designExerciseId !== null) ? (
          <button
            type="button"
            className="path-continue"
            data-testid="path-continue"
            onClick={() =>
              next.kind === 'topic'
                ? onOpenTopic(next.topic)
                : onOpenExercise(next.designExerciseId!)
            }
          >
            {continueLabel(next)}
          </button>
        ) : (
          <p data-testid="path-no-next">{next ? stepTitle(next) : noNextStepText(path)}</p>
        )}
      </section>
      {learningPathSections.map((section) => {
        const steps = path.steps.filter((step) => step.section === section)
        if (steps.length === 0) return null
        return (
          <section key={section} className="path-section" aria-labelledby={`path-${section}`}>
            <h2 id={`path-${section}`}>{sectionTitles[section]}</h2>
            <ol className="path-steps">
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
