/**
 * Lesson Question types shared by the main process (src/main/lessonQuestion) and the Lesson views.
 * A Lesson Question is asked about a selected passage of a Lesson, a Remediation Lesson or a
 * Protocol Step Lesson; the answer streams as the events of a lesson (`LessonEvent`).
 */
import type { ProtocolStep } from './protocol'

/** Longest quoted passage sent with a question, in characters (longer selections are cut). */
export const LESSON_QUESTION_MAX_SELECTION = 1500

/** Longest question accepted, in characters. */
export const LESSON_QUESTION_MAX_QUESTION = 500

/** Earlier exchanges of the thread sent as context: the most recent ones. */
export const LESSON_QUESTION_MAX_THREAD = 3

/** Longest text of an earlier answer sent back as context, in characters. */
export const LESSON_QUESTION_MAX_PREVIOUS_ANSWER = 1500

/** Longest Lesson text accepted, in characters (a Lesson is about 2,000 to 8,000). */
export const LESSON_QUESTION_MAX_LESSON = 60_000

/** The text the learner is reading when asking: where the question comes from. */
export type LessonQuestionContext =
  | { kind: 'lesson'; topicId: number }
  | { kind: 'remediation'; topicId: number; notionId: number }
  | { kind: 'protocol_step'; step: ProtocolStep }

/** An exchange of the thread, as sent back to ground a follow-up question. */
export interface LessonQuestionExchange {
  /** The passage that was quoted for this question. */
  selection: string
  question: string
  answer: string
}

export interface LessonQuestionAskRequest {
  /** Chosen by the renderer (`crypto.randomUUID()`), tags every event of the request. */
  requestId: string
  context: LessonQuestionContext
  /** The Lesson (Markdown) the learner is reading, complete. */
  lesson: string
  /** The quoted passage the question is about. */
  selection: string
  question: string
  /** Earlier exchanges of this thread, oldest first. */
  thread: LessonQuestionExchange[]
}

export interface LessonQuestionCancelRequest {
  requestId: string
}
