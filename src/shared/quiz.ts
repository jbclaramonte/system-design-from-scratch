/**
 * Quiz types shared by the main process (src/main/quiz) and the renderer (src/renderer/src/quiz).
 *
 * Answer keys never cross the IPC boundary before an answer is submitted: the renderer gets a
 * `QuestionView` (no `correct` flag, no explanation) and the main process grades. Feedback
 * (`QuestionFeedback`) carries the answer key once the question is answered. The model answer of
 * a free-answer question is only sent with its grading.
 */
import type { GenerationErrorInfo } from './generation'

export const questionTypes = [
  'single_choice',
  'multiple_choice',
  'scenario',
  'free_answer'
] as const
export type QuestionType = (typeof questionTypes)[number]

/** Question types graded locally, with no Generation. */
export const locallyGradedTypes = ['single_choice', 'multiple_choice', 'scenario'] as const
export type LocallyGradedType = (typeof locallyGradedTypes)[number]

export type AttemptResult = 'correct' | 'partially_correct' | 'incorrect'

/**
 * Outcome of grading one answer, stored on the Attempt. Shared by every grader (the local ones
 * and the free-answer grading Generation).
 */
export interface GradingResult {
  result: AttemptResult
  /** Mastery credit between 0 and 1, the value the quiz and notion scores sum up. */
  score: number
  /**
   * Feedback stored on the Attempt: a `FreeAnswerGradingRecord` as JSON for a free answer, null
   * for local grading.
   */
  feedback: string | null
}

/** Answer to a choice question (single choice, multiple choice, scenario): choice indexes. */
export interface ChoiceAnswer {
  selected: number[]
}

/** Answer to a free-answer question: the learner's text, graded by a Generation. */
export interface FreeAnswer {
  text: string
}

/** Longest free answer accepted, in characters (a short answer is one to a few sentences). */
export const FREE_ANSWER_MAX_LENGTH = 1200

/** Longest justification accepted when the learner contests a free-answer grade. */
export const CONTEST_JUSTIFICATION_MAX_LENGTH = 500

/** Longest reason accepted when the learner flags a question as faulty. */
export const FLAG_REASON_MAX_LENGTH = 500

/** Answer sent by the renderer. */
export type QuestionAnswer = ChoiceAnswer | FreeAnswer

export interface NotionRef {
  id: number
  slug: string
  title: string
}

/** A question as shown before it is answered: no answer key, no explanation. */
export interface QuestionView {
  id: number
  position: number
  type: QuestionType
  /** French. */
  prompt: string
  /** Situation of a scenario question, French. */
  scenario: string | null
  /**
   * Mermaid source of the question's Diagram (choice questions only), or null. Checked at
   * generation never to contain the text of a correct choice (see docs/Quiz Engine.md).
   */
  diagram: string | null
  /** Choice texts in display order; the answer refers to them by index. Empty for free answers. */
  choices: string[]
  notions: NotionRef[]
  /**
   * False when no grader is configured for the type (free answers without a Generation service,
   * as in some tests): the player skips it and the round leaves it out of the score.
   */
  gradable: boolean
}

export interface QuizView {
  id: number
  topicId: number
  topicTitle: string
  grounded: boolean
  questions: QuestionView[]
}

export interface QuizSummary {
  id: number
  topicId: number
  createdAt: string
  grounded: boolean
  questionCount: number
  gradableQuestionCount: number
}

export interface QuizRef {
  topicId: number
  quizId: number
}

export interface QuizTopic {
  id: number
  slug: string
  title: string
  quizCount: number
}

export interface ChoiceFeedbackItem {
  text: string
  correct: boolean
  selected: boolean
}

interface QuestionFeedbackBase extends GradingResult {
  questionId: number
  type: QuestionType
  /** French. */
  prompt: string
  /**
   * Informational, the mastery `score` stays all-or-nothing. Multiple choice: (correct picks -
   * wrong picks) / correct choices, floored at 0. Free answer: covered expected points / expected
   * points. Null for the other types.
   */
  partialCredit: number | null
}

/** Feedback on an answered choice question (single choice, multiple choice, scenario). */
export interface ChoiceQuestionFeedback extends QuestionFeedbackBase {
  kind: 'choice'
  choices: ChoiceFeedbackItem[]
  /** Scenario situation, shown again next to its trade-off justification. */
  scenario: string | null
  /** Stored explanation (for a scenario, the trade-off justification). French. */
  explanation: string
}

/**
 * What the free-answer grading Generation returns (see docs/Quiz Engine.md). `expectedPoints` is
 * aligned with the question's expected points, in order. French text.
 */
export type FreeAnswerGrading = {
  verdict: AttemptResult
  expectedPoints: { covered: boolean; justification: string }[]
  misconceptions: string[]
  /** Short explanation tied to the notion. */
  explanation: string
  /** What to review, one short item each. */
  toReview: string[]
}

/** An earlier grading of the same Attempt, replaced after a contest. */
export type PastFreeAnswerGrading = {
  promptVersion: string
  grading: FreeAnswerGrading
}

/**
 * The free-answer grading stored on the Attempt (`attempts.feedback`, as JSON): the grading in
 * force, the contest if any, and the gradings it replaced, oldest first.
 */
export type FreeAnswerGradingRecord = {
  promptVersion: string
  grading: FreeAnswerGrading
  contest: { justification: string; contestedAt: string } | null
  history: PastFreeAnswerGrading[]
}

export interface ExpectedPointFeedback {
  /** The expected point, from the question's rubric. French. */
  point: string
  covered: boolean
  justification: string
}

/** Feedback on an answered free-answer question. Model answer revealed only now. */
export interface FreeAnswerQuestionFeedback extends QuestionFeedbackBase {
  kind: 'free_answer'
  /** The learner's answer. */
  answer: string
  expectedPoints: ExpectedPointFeedback[]
  misconceptions: string[]
  explanation: string
  toReview: string[]
  modelAnswer: string
  /** Set once the grade was contested: the justification and the grading it replaced. */
  contest: {
    justification: string
    previous: {
      result: AttemptResult
      expectedPoints: ExpectedPointFeedback[]
      explanation: string
    }
  } | null
  /** The grade can still be contested: not correct, not contested yet, round still open. */
  contestable: boolean
}

/** Feedback on an answered question, with the answer key. */
export type QuestionFeedback = ChoiceQuestionFeedback | FreeAnswerQuestionFeedback

export interface NotionScore extends NotionRef {
  questionCount: number
  /** Sum of the question scores. */
  earned: number
  /** 0 to 100. */
  scorePercent: number
  /** At least one question on the notion was not fully correct: a remediation target (#11). */
  missed: boolean
}

export interface RoundView {
  id: number
  topicId: number
  quizId: number
  /** Unique per topic, never restarts. */
  number: number
  startedAt: string
  completedAt: string | null
  scorePercent: number | null
  passed: boolean | null
}

export interface RoundStart {
  round: RoundView
  quiz: QuizView
  /** Questions already answered in this round (when an open round is resumed). */
  answered: QuestionFeedback[]
}

export interface RoundResult {
  round: RoundView
  /**
   * Mastery Threshold in percent: the one used at completion, or the current setting when a past
   * result is reloaded (`round.passed` is stored, so it does not change with the setting).
   */
  masteryThreshold: number
  questions: QuestionFeedback[]
  notionScores: NotionScore[]
  /** Questions left out of the score because no grader is configured for their type. */
  skippedQuestionIds: number[]
}

export interface SubmittedAnswer {
  questionId: number
  answer: QuestionAnswer
}

/**
 * Outcome of a free-answer grading over IPC. A failed Generation is an outcome, not a thrown
 * error, so the renderer gets its typed code (`cli_not_found`, `cancelled`...). Nothing is
 * recorded on failure: the learner can retry or skip.
 */
export type FreeAnswerGradingOutcome =
  | { status: 'graded'; feedback: QuestionFeedback }
  | { status: 'failed'; error: GenerationErrorInfo }
