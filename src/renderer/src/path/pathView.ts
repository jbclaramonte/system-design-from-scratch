// View-model of the Learning Path screen (#67): what the header strip, the section headers and
// the nodes say, derived from the `LearningPath` of the main process. Pure and tested; the model,
// the unlock rules and the locks stay in src/main/path. Wording follows docs/Learning Path
// Implementation.md: calm, nothing red for a locked step, status always in words.
import {
  learningPathSections,
  type LearningPath,
  type LearningPathSection,
  type LearningPathStep,
  type LearningPathStepStatus
} from '../../../shared/learningPath'
import {
  filteredSections,
  noNextStepText,
  prerequisiteText,
  progressText,
  recommendedStep,
  sectionCounter,
  sectionTitles,
  stepTitle,
  type PathFilter
} from './pathText'

/** The tone of a node: the tile and the status mark. Never red: a step to review is attention. */
export type NodeTone = 'mastered' | 'progress' | 'attention' | 'neutral'

export const nodeTone: Record<LearningPathStepStatus, NodeTone> = {
  locked: 'neutral',
  available: 'progress',
  in_progress: 'progress',
  mastered: 'mastered',
  skipped: 'attention',
  limit_reached: 'attention',
  completed: 'mastered',
  coming_soon: 'neutral'
}

/**
 * The status of a node in words. A skipped topic and one at the Round Limit are both "To review"
 * (the note under the node says which); an in-progress topic names its Round.
 */
export function nodeStatusLabel(step: LearningPathStep): string {
  switch (step.status) {
    case 'locked':
      return 'Locked'
    case 'available':
      return step.kind === 'design_exercise' ? 'Ready to start' : 'Not started'
    case 'in_progress':
      return step.kind === 'topic' ? `In progress, Round ${step.topic.roundNumber}` : 'In progress'
    case 'mastered':
      return 'Mastered'
    case 'completed':
      return 'Completed'
    case 'skipped':
    case 'limit_reached':
      return 'To review'
    case 'coming_soon':
      return 'Coming soon'
  }
}

/** The action of a node ("Start", "Resume"...), or null for a step that cannot be opened. */
export function nodeActionLabel(step: LearningPathStep): string | null {
  switch (step.status) {
    case 'available':
      return 'Start'
    case 'in_progress':
      return 'Resume'
    case 'skipped':
      return 'Come back'
    case 'limit_reached':
      return 'Choose how to go on'
    case 'mastered':
    case 'completed':
      return 'Review'
    case 'locked':
    case 'coming_soon':
      return null
  }
}

/** A step the learner opens by activating its node: not a locked or coming-soon one. */
export const nodeIsOpenable = (step: LearningPathStep): boolean =>
  nodeActionLabel(step) !== null && (step.kind === 'topic' || step.designExerciseId !== null)

export interface NodeView {
  key: string
  kind: LearningPathStep['kind']
  title: string
  status: LearningPathStepStatus
  tone: NodeTone
  statusLabel: string
  /** "Step 03" inside its section. */
  stepLabel: string
  /** The recommended step: highlighted, `aria-current="step"`, offers the primary action. */
  current: boolean
  /** The visible action ("Resume"); null when the node opens nothing. */
  action: string | null
  /** A line under the title: notions of a topic, prerequisites of an exercise. */
  detail: string | null
  /** The whole name of the node's control: title, status, action. */
  accessibleName: string
}

function nodeDetail(step: LearningPathStep): string | null {
  if (step.kind === 'design_exercise') {
    return prerequisiteText(step)
  }
  const { notionCount } = step.topic
  return notionCount > 0 ? `${notionCount} ${notionCount === 1 ? 'notion' : 'notions'}` : null
}

export function nodeView(path: LearningPath, step: LearningPathStep, index: number): NodeView {
  const title = stepTitle(step)
  const statusLabel = nodeStatusLabel(step)
  const action = nodeIsOpenable(step) ? nodeActionLabel(step) : null
  const extras = [
    step.kind === 'topic' && !step.topic.grounded && 'Outside the primer',
    step.kind === 'topic' && step.topic.declared && 'Declared as already known',
    step.forcedUnlock && step.status !== 'mastered' && step.status !== 'completed'
      ? 'Opened by a Forced Unlock'
      : false
  ].filter((extra): extra is string => Boolean(extra))
  return {
    key: step.key,
    kind: step.kind,
    title,
    status: step.status,
    tone: nodeTone[step.status],
    statusLabel,
    stepLabel: `Step ${String(index + 1).padStart(2, '0')}`,
    current: step.key === path.nextStepKey,
    action,
    detail: nodeDetail(step),
    accessibleName: [title, statusLabel, ...extras, action].filter(Boolean).join('. ')
  }
}

export type SectionState = 'complete' | 'in_progress' | 'not_started'

export const sectionStateLabels: Record<SectionState, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  not_started: 'Not started'
}

export interface SectionView {
  section: LearningPathSection
  title: string
  /** "6/6 mastered", "1/8 completed". */
  counter: string
  done: number
  total: number
  state: SectionState
  /** The recommended step is in this section. */
  current: boolean
  nodes: NodeView[]
}

const isDone = (step: LearningPathStep): boolean =>
  step.status === 'mastered' || step.status === 'completed'

export function sectionView(path: LearningPath, section: LearningPathSection): SectionView {
  const steps = path.steps.filter((step) => step.section === section)
  const done = steps.filter(isDone).length
  const started = steps.some(
    (step) => isDone(step) || step.status === 'in_progress' || step.status === 'skipped'
  )
  return {
    section,
    title: sectionTitles[section],
    counter: sectionCounter(path, section),
    done,
    total: steps.length,
    state:
      steps.length > 0 && done === steps.length
        ? 'complete'
        : started
          ? 'in_progress'
          : 'not_started',
    current: steps.some((step) => step.key === path.nextStepKey),
    nodes: steps.map((step, index) => nodeView(path, step, index))
  }
}

/** The next milestone of the header strip: the recommended step, or why there is none. */
export interface NextMilestone {
  /** The recommended step; null when there is none. */
  step: NodeView | null
  /** The title, or the sentence saying there is nothing to start. */
  text: string
}

export interface PathStripView {
  progress: {
    mastered: number
    total: number
    percent: number
    /** "6 of 21 topics mastered (28%)". */
    text: string
  }
  nextMilestone: NextMilestone
}

export function stripView(path: LearningPath): PathStripView {
  const next = recommendedStep(path)
  const inSection = next ? path.steps.filter((step) => step.section === next.section) : []
  return {
    progress: {
      mastered: path.progress.masteredTopics,
      total: path.progress.totalTopics,
      percent: path.progress.percent,
      text: progressText(path.progress)
    },
    nextMilestone: next
      ? { step: nodeView(path, next, inSection.indexOf(next)), text: stepTitle(next) }
      : { step: null, text: noNextStepText(path) }
  }
}

export interface PathView {
  strip: PathStripView
  /** The sections the filter shows and that have steps, in path order. */
  sections: SectionView[]
}

export function buildPathView(path: LearningPath, filter: PathFilter): PathView {
  const shown = filteredSections(filter)
  return {
    strip: stripView(path),
    sections: learningPathSections
      .filter((section) => shown.includes(section))
      .map((section) => sectionView(path, section))
      .filter((section) => section.total > 0)
  }
}
