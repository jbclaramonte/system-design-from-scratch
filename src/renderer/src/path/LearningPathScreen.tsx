import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStep,
  TopicStep
} from '../../../shared/learningPath'
import type { TopicMasterySummary } from '../../../shared/mastery'
import { ActivityCard } from '../activity/ActivityCard'
import { DeclareMastery, UndoDeclaration } from '../mastery/DeclaredMastery'
import { errorMessage } from '../quiz/errorMessage'
import { LevelCard } from '../rewards/LevelCard'
import './path.css'
import {
  canDeclareTopic,
  canForceUnlock,
  canLockAgain,
  canOpenExercise,
  forcedUnlockConfirmation,
  forcedUnlockNote,
  lockMessage,
  pathFilterLabels,
  pathFilters,
  showsForcedUnlock,
  statusNote,
  topicStepBySlug,
  type PathFilter
} from './pathText'
import { NodeFace, PathStrip, SectionGlyph, SectionStateChip } from './PathParts'
import { buildPathView, type NodeView } from './pathView'

type OpenTopic = (topic: TopicMasterySummary) => void
type SetPath = (path: LearningPath) => void
/** Opens a Design Exercise (`design_exercises.id`). */
type OpenExercise = (designExerciseId: number) => void

/** The marker of a step opened by a Forced Unlock. */
function ForcedUnlockChip({ step }: { step: LearningPathStep }) {
  return showsForcedUnlock(step) ? (
    <span
      className="chip chip-attention"
      title="Opened without mastering the steps before it"
      data-testid="path-forced-marker"
    >
      Forced unlock
    </span>
  ) : null
}

/** The marker of a topic mastered by Declared Mastery: no Round was passed. */
function DeclaredChip({ step }: { step: TopicStep }) {
  return step.topic.declared ? (
    <span
      className="chip"
      title="Mastered without a Round: you declared this topic as already known"
      data-testid="path-declared-marker"
    >
      Declared
    </span>
  ) : null
}

/**
 * Declared Mastery on a topic: "I already know this" (with its confirmation) on an open topic
 * that is not mastered, "Undo" while the declaration can still be undone.
 */
function DeclaredMasteryActions({ step }: { step: TopicStep }) {
  if (step.topic.declared) {
    return (
      <div className="path-unlock">
        <p className="path-step-note path-unlock-note" data-testid="path-declared-note">
          <span>Declared as already known: no Round, no score.</span>
          {step.topic.canUndoDeclaration && <UndoDeclaration topicId={step.topic.id} />}
        </p>
      </div>
    )
  }
  if (!canDeclareTopic(step)) return null
  return (
    <div className="path-unlock">
      <DeclareMastery topicId={step.topic.id} topicTitle={step.topic.title} />
    </div>
  )
}

/**
 * Forced Unlock of a step: "Unlock anyway" on a locked step (after a confirmation that says the
 * step opens without credit), and "Lock again" on a forced-unlocked step that has no progress.
 * The main process stores it and pushes the recomputed path; the answer is also handed to
 * `onPath` so the screen never waits for the push.
 */
function ForcedUnlockActions({
  step,
  onPath
}: {
  step: TopicStep | DesignExerciseStep
  onPath: SetPath
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refocusAction = useRef(false)
  const action = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const titleId = `unlock-${step.key}`

  // Keyboard users keep their place: the confirm button when asked, then the button that replaces
  // the one pressed.
  useEffect(() => {
    if (confirming) confirm.current?.focus()
  }, [confirming])
  useEffect(() => {
    if (!refocusAction.current) return
    refocusAction.current = false
    action.current?.focus()
  }, [confirming, step.status, step.forcedUnlock])

  const run = (call: Promise<LearningPath>) => {
    setError(null)
    call
      .then((path) => {
        setConfirming(false)
        refocusAction.current = true
        onPath(path)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }
  const cancel = () => {
    setConfirming(false)
    refocusAction.current = true
  }

  if (canForceUnlock(step)) {
    return (
      <div className="path-unlock">
        {confirming ? (
          <div
            role="group"
            aria-labelledby={titleId}
            className="notice notice-attention path-unlock-confirm"
            data-testid="path-unlock-confirmation"
            onKeyDown={(event) => event.key === 'Escape' && cancel()}
          >
            <p id={titleId}>{forcedUnlockConfirmation(step)}</p>
            <div className="chip-row">
              <button
                ref={confirm}
                type="button"
                className="btn btn-sm card-clickable-action"
                data-testid="path-unlock-confirm"
                onClick={() => run(window.api.forceUnlockStep({ stepKey: step.key }))}
              >
                Unlock without credit
              </button>
              <button type="button" className="btn btn-sm card-clickable-action" onClick={cancel}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={action}
            type="button"
            className="btn btn-sm card-clickable-action"
            data-testid="path-unlock-anyway"
            onClick={() => setConfirming(true)}
          >
            Unlock anyway
          </button>
        )}
        {error && (
          <p role="alert" className="path-unlock-error">
            Could not unlock: {error}
          </p>
        )}
      </div>
    )
  }

  if (!step.forcedUnlock || !showsForcedUnlock(step)) return null
  return (
    <div className="path-unlock">
      <p className="path-step-note path-unlock-note" data-testid="path-forced-note">
        <span>{forcedUnlockNote(step)}</span>
        {canLockAgain(step) && (
          <button
            ref={action}
            type="button"
            className="btn btn-sm card-clickable-action"
            data-testid="path-lock-again"
            onClick={() => run(window.api.lockStepAgain({ stepKey: step.key }))}
          >
            Lock again
          </button>
        )}
      </p>
      {error && (
        <p role="alert" className="path-unlock-error">
          Could not lock again: {error}
        </p>
      )}
    </div>
  )
}

/** The one control of a node: a button over the whole card, or an inert block for a locked step. */
function NodeMain({
  node,
  onOpen,
  children
}: {
  node: NodeView
  onOpen: (() => void) | null
  children: ReactNode
}) {
  return onOpen ? (
    <button
      type="button"
      className="card-clickable-main path-node-main"
      aria-label={node.accessibleName}
      data-testid={node.current ? 'path-continue' : undefined}
      onClick={onOpen}
    >
      <NodeFace node={node}>{children}</NodeFace>
    </button>
  ) : (
    <div className="card-clickable-main path-node-main" aria-disabled="true">
      <NodeFace node={node}>{children}</NodeFace>
    </div>
  )
}

function nodeClass(node: NodeView): string {
  return `path-node path-node-${node.status}${node.current ? ' path-node-current' : ''}`
}

function TopicNode({
  step,
  node,
  path,
  onOpenTopic,
  onPath
}: {
  step: TopicStep
  node: NodeView
  path: LearningPath
  onOpenTopic: OpenTopic
  onPath: SetPath
}) {
  const lock = lockMessage(step)
  const note = statusNote(step)
  // A lock message names the topic to master: offer to open it unless it is locked too.
  const blocker = step.lockedBy && topicStepBySlug(path, step.lockedBy.slug)
  const chips = (
    <span className="path-node-chips">
      {!step.topic.grounded && (
        <span
          className="chip chip-attention"
          title="Foundations Module: generated from general knowledge, not checked against the primer"
        >
          Outside the primer
        </span>
      )}
      <DeclaredChip step={step} />
      <ForcedUnlockChip step={step} />
    </span>
  )
  return (
    <li
      className={nodeClass(node)}
      data-step={step.key}
      aria-current={node.current ? 'step' : undefined}
    >
      <div className="card card-clickable path-step">
        <NodeMain
          node={node}
          onOpen={step.status === 'locked' ? null : () => onOpenTopic(step.topic)}
        >
          {chips}
        </NodeMain>
        <div className="path-node-extras">
          {lock && (
            <p className="path-step-note" data-testid="path-lock-message">
              <span>{lock}</span>
              {blocker && blocker.status !== 'locked' && blocker.status !== 'mastered' && (
                <button
                  type="button"
                  className="btn btn-sm card-clickable-action"
                  onClick={() => onOpenTopic(blocker.topic)}
                >
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
          <ForcedUnlockActions step={step} onPath={onPath} />
          <DeclaredMasteryActions step={step} />
        </div>
      </div>
    </li>
  )
}

function ExerciseNode({
  step,
  node,
  onOpenExercise,
  onPath
}: {
  step: DesignExerciseStep
  node: NodeView
  onOpenExercise: OpenExercise
  onPath: SetPath
}) {
  const lock = lockMessage(step)
  const id = canOpenExercise(step) ? step.designExerciseId : null
  const chips = (
    <span className="path-node-chips">
      <ForcedUnlockChip step={step} />
    </span>
  )
  return (
    <li
      className={`${nodeClass(node)} path-exercise`}
      data-step={step.key}
      aria-current={node.current ? 'step' : undefined}
    >
      <div className="card card-clickable path-step">
        <NodeMain node={node} onOpen={id !== null ? () => onOpenExercise(id) : null}>
          {chips}
        </NodeMain>
        <div className="path-node-extras">
          <p className="path-step-note" data-testid={lock ? 'path-lock-message' : undefined}>
            <span>{lock ?? 'Prerequisites mastered.'}</span>
          </p>
          <ForcedUnlockActions step={step} onPath={onPath} />
          <p className="path-rationale">{step.rationale}</p>
        </div>
      </div>
    </li>
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
    <div className="path-title">
      <h1>Learning Path</h1>
      <p className="muted">
        Foundations, primer topics and Design Exercises: each step unlocks once the previous one is
        mastered.
      </p>
    </div>
  )
  if (error) {
    return (
      <div className="path-screen">
        <header className="path-header">{heading}</header>
        <p role="alert">Could not load the Learning Path: {error}</p>
      </div>
    )
  }
  if (!path) {
    return (
      <div className="path-screen">
        <header className="path-header">{heading}</header>
        <p>Loading the Learning Path...</p>
      </div>
    )
  }

  const view = buildPathView(path, filter)
  const stepOf = (key: string) => path.steps.find((step) => step.key === key)!
  return (
    <div className="path-screen" data-testid="learning-path">
      <header className="path-header">
        {heading}
        <PathStrip strip={view.strip} />
      </header>
      <div className="path-layout">
        <div className="path-main">
          <div className="tabs" role="group" aria-label="Filter the Learning Path">
            {pathFilters.map((value) => (
              <button
                key={value}
                type="button"
                className="tab"
                aria-pressed={filter === value}
                data-testid={`path-filter-${value}`}
                onClick={() => setFilter(value)}
              >
                {pathFilterLabels[value]}
              </button>
            ))}
          </div>
          {view.sections.map((section) => (
            <section
              key={section.section}
              className={`path-section${section.current ? ' path-section-current' : ''}`}
              aria-labelledby={`path-${section.section}`}
            >
              <div className="card path-section-head">
                <span className="icon-tile icon-tile-neutral" aria-hidden="true">
                  <SectionGlyph />
                </span>
                <div className="path-section-text">
                  <h2 id={`path-${section.section}`}>{section.title}</h2>
                  <p className="label-mono muted" data-testid={`path-counter-${section.section}`}>
                    {section.counter}
                  </p>
                </div>
                <SectionStateChip state={section.state} />
              </div>
              <ol className="path-nodes">
                {section.nodes.map((node) => {
                  const step = stepOf(node.key)
                  return step.kind === 'topic' ? (
                    <TopicNode
                      key={node.key}
                      step={step}
                      node={node}
                      path={path}
                      onOpenTopic={onOpenTopic}
                      onPath={setPath}
                    />
                  ) : (
                    <ExerciseNode
                      key={node.key}
                      step={step}
                      node={node}
                      onOpenExercise={onOpenExercise}
                      onPath={setPath}
                    />
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
        <aside className="path-aside" aria-label="Level and streak">
          <LevelCard />
          <ActivityCard />
        </aside>
      </div>
    </div>
  )
}
