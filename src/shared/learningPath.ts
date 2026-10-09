/**
 * Learning Path types shared by the main process (src/main/path) and the path screen
 * (src/renderer/src/path). The path is computed in the main process from the database (topics
 * and their mastery), so it is never stored. Rules in docs/Learning Path Implementation.md.
 */
import type { TopicMasterySummary } from './mastery'

/** The three sections of the Learning Path, in order. */
export const learningPathSections = ['foundations', 'primer', 'design_exercises'] as const
export type LearningPathSection = (typeof learningPathSections)[number]

/**
 * Status of a step:
 * - `locked`: the previous topic (or a prerequisite topic of a Design Exercise) is not mastered.
 * - `available`: unlocked, not started.
 * - `in_progress`, `skipped`, `limit_reached`: the topic's mastery, see the Mastery Loop.
 * - `mastered`: the topic met the Mastery Threshold once; it stays mastered.
 * - `coming_soon`: a Design Exercise that is not implemented yet; never startable.
 */
export const learningPathStepStatuses = [
  'locked',
  'available',
  'in_progress',
  'mastered',
  'skipped',
  'limit_reached',
  'coming_soon'
] as const
export type LearningPathStepStatus = (typeof learningPathStepStatuses)[number]

/** A topic named in a lock reason. */
export interface LearningPathTopicRef {
  slug: string
  title: string
  /** The topic's own step status, so the screen can say why it does not unlock (skipped...). */
  status: LearningPathStepStatus
}

/** A Foundations Module or primer topic. */
export interface TopicStep {
  kind: 'topic'
  /** Unique in the path: `topic:<slug>`. */
  key: string
  section: 'foundations' | 'primer'
  topic: TopicMasterySummary
  status: LearningPathStepStatus
  /** The previous topic to master first, when `locked`. */
  lockedBy: LearningPathTopicRef | null
}

/** A Design Exercise slot (one per primer Reference Solution). */
export interface DesignExerciseStep {
  kind: 'design_exercise'
  /** Unique in the path: `design_exercise:<slug>`. */
  key: string
  section: 'design_exercises'
  /** Reference Solution id, for example `pastebin`. */
  slug: string
  title: string
  status: Extract<LearningPathStepStatus, 'locked' | 'available' | 'coming_soon'>
  /** Topics to master before the exercise unlocks, with why. */
  prerequisites: LearningPathTopicRef[]
  /** The prerequisites not mastered yet (empty once unlocked). */
  missingPrerequisites: LearningPathTopicRef[]
  rationale: string
}

export type LearningPathStep = TopicStep | DesignExerciseStep

export interface LearningPathProgress {
  masteredTopics: number
  totalTopics: number
  /** Mastered topics over all topics, 0 to 100 (rounded down). */
  percent: number
  /** Design Exercises whose prerequisites are all mastered (implemented or not). */
  unlockedExercises: number
  totalExercises: number
}

export interface LearningPath {
  /** Foundations Module topics, then primer topics, then Design Exercises. */
  steps: LearningPathStep[]
  /** Key of the recommended step (the "Continue" call to action), null when there is none. */
  nextStepKey: string | null
  progress: LearningPathProgress
}
