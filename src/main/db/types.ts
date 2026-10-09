/** Row types returned by the repositories. Timestamps are ISO 8601 strings. */

import type { Json } from '../../shared/json'
import { questionTypes, type AttemptResult, type QuestionType } from '../../shared/quiz'

export type { Json }

export interface Timestamps {
  createdAt: string
  updatedAt: string
}

/** Grounding info carried by generated content. */
export interface Grounded {
  grounded: boolean
  /** References to the Source Corpus sections the content was generated from. */
  sourceSections: string[]
}

export interface Topic extends Timestamps {
  id: number
  slug: string
  title: string
  position: number
  inFoundationsModule: boolean
  sourceSection: string | null
}

export interface Notion extends Timestamps {
  id: number
  topicId: number
  slug: string
  title: string
  description: string | null
  /** Source Corpus sections the notion comes from (empty in the Foundations Module). */
  sourceSections: string[]
}

export interface Lesson extends Timestamps, Grounded {
  id: number
  topicId: number
  content: string
  contentCacheKey: string | null
}

export interface RemediationLesson extends Timestamps, Grounded {
  id: number
  notionId: number
  roundId: number | null
  content: string
  contentCacheKey: string | null
}

export interface Quiz extends Timestamps, Grounded {
  id: number
  topicId: number
  contentCacheKey: string | null
}

export { questionTypes }
export type { QuestionType, AttemptResult }

export interface Question extends Timestamps {
  id: number
  quizId: number
  position: number
  type: QuestionType
  prompt: string
  /** Type-specific payload: choices, answer key, scenario, grading rubric. */
  body: Json
  notionIds: number[]
  /** Set when the learner flagged the question as faulty. */
  flaggedAt: string | null
  flagReason: string | null
  /** The question that replaced this flagged one in its quiz, if it was regenerated. */
  replacedByQuestionId: number | null
}

export interface Round extends Timestamps {
  id: number
  topicId: number
  quizId: number
  number: number
  startedAt: string
  completedAt: string | null
  scorePercent: number | null
  passed: boolean | null
}

export interface Attempt extends Timestamps {
  id: number
  questionId: number
  roundId: number | null
  questionType: QuestionType
  notionIds: number[]
  answer: Json
  result: AttemptResult
  /** Between 0 and 1. */
  score: number
  feedback: string | null
  attemptedAt: string
}

export interface DesignExercise extends Timestamps {
  id: number
  slug: string
  title: string
  position: number
  grounded: boolean
  referenceSolutionSection: string | null
}

export interface DesignScene extends Timestamps {
  id: number
  designExerciseId: number
  /** tldraw store snapshot. */
  snapshot: Json
}

export const protocolSteps = [
  'functional_requirements',
  'estimations',
  'api',
  'data_model',
  'high_level_design',
  'non_functional_requirements',
  'deep_dive'
] as const
export type ProtocolStep = (typeof protocolSteps)[number]

export type DesignFeedbackKind = 'step_feedback' | 'hint' | 'final_review'

export interface DesignFeedback extends Timestamps {
  id: number
  designExerciseId: number
  kind: DesignFeedbackKind
  /** Null only for the final review. */
  protocolStep: ProtocolStep | null
  content: Json
  grounded: boolean
}

export type ContentCacheKind = 'lesson' | 'remediation_lesson' | 'quiz'

export interface ContentCacheEntry extends Timestamps, Grounded {
  cacheKey: string
  kind: ContentCacheKind
  inputs: Json
  promptVersion: string
  content: Json
}

export interface Settings {
  /** Percent, 0 to 100. */
  masteryThreshold: number
  roundLimit: number
}
