/**
 * Recall Quiz and Memory Review types shared by the main process (src/main/recall) and the
 * renderer. Like the Quiz types, answer keys never cross the IPC boundary before an answer is
 * submitted: a `RecallQuestionView` has no `correct` flag and no explanation.
 */
import type { NotionRef, QuestionFeedback, QuestionView } from './quiz'

/** `gate` is taken before a Lesson opens, `practice` is started from Memory Review. */
export type RecallSessionKind = 'gate' | 'practice'

export interface RecallSessionView {
  id: number
  kind: RecallSessionKind
  /** The Topic being opened for a `gate`; null for `practice`. */
  topicId: number | null
  startedAt: string
  completedAt: string | null
}

/** How often a Shaky Notion was missed: `missed` of its latest `of` answers. */
export interface RecallHint {
  missed: number
  of: number
}

/**
 * A question of a Recall session. `recallHint` is set when one of its Notions needs attention
 * (the shakiest one counts), for the "Often missed" tag.
 */
export type RecallQuestionView = QuestionView & { recallHint: RecallHint | null }

export interface RecallStart {
  session: RecallSessionView
  questions: RecallQuestionView[]
  /** Feedback on the questions already answered (when an open session is resumed). */
  answered: QuestionFeedback[]
}

export interface RecallNotionOutcome {
  notion: NotionRef
  /** Questions of the session on this Notion that were answered correctly. */
  correct: number
  /** Questions of the session on this Notion. */
  asked: number
}

export interface RecallResult {
  session: RecallSessionView
  /** Feedback on every question, in the order they were asked. */
  questions: QuestionFeedback[]
  notionOutcomes: RecallNotionOutcome[]
}

/**
 * How well a Notion is remembered, and the groups of Memory Review. A Notion with fewer than 2
 * answers is tracked in none of them.
 */
export type NotionRecallStatus = 'needs_attention' | 'steadier' | 'solid'

export interface MemoryReviewNotion {
  notion: NotionRef
  topicTitle: string
  topicSlug: string
  /** The latest results, oldest first (at most 6); `true` is correct. */
  lastResults: boolean[]
  /** Missed answers among `lastResults`. */
  missed: number
  /** Number of `lastResults`. */
  of: number
  /** ISO 8601 time of the latest answer on the Notion; null if unknown. */
  lastSeenAt: string | null
  /** Source Corpus sections the Notion comes from, to open the Lesson section. */
  sourceSections: string[]
}

export interface MemoryReviewView {
  /** Tracked Notions: needsAttention + steadier + solid. */
  tracked: number
  needsAttention: number
  steadier: number
  solid: number
  groups: Record<NotionRecallStatus, MemoryReviewNotion[]>
}
