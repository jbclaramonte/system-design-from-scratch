/**
 * Quiz types shared by the main process (src/main/quiz) and the renderer (src/renderer/src/quiz).
 *
 * Answer keys never cross the IPC boundary before an answer is submitted: the renderer gets a
 * `QuestionView` (no `correct` flag, no explanation) and the main process grades. Feedback
 * (`QuestionFeedback`) carries the answer key once the question is answered.
 */

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
 * Outcome of grading one answer, stored on the Attempt. Shared by every grader (local ones here,
 * the free-answer grader of #10).
 */
export interface GradingResult {
  result: AttemptResult
  /** Mastery credit between 0 and 1, the value the quiz and notion scores sum up. */
  score: number
  /** Text feedback stored on the Attempt (free-answer grading); null for local grading. */
  feedback: string | null
}

/** Answer to a choice question (single choice, multiple choice, scenario): choice indexes. */
export interface ChoiceAnswer {
  selected: number[]
}

/** Answer sent by the renderer. #10 adds the free-answer shape. */
export type QuestionAnswer = ChoiceAnswer

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
  /** Choice texts in display order; the answer refers to them by index. Empty for free answers. */
  choices: string[]
  notions: NotionRef[]
  /** False when no grader exists yet for the type (free answer until #10): the player skips it. */
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

/** Feedback on an answered question, with the answer key. */
export interface QuestionFeedback extends GradingResult {
  questionId: number
  type: QuestionType
  /** French. */
  prompt: string
  kind: 'choice'
  choices: ChoiceFeedbackItem[]
  /** Scenario situation, shown again next to its trade-off justification. */
  scenario: string | null
  /** Stored explanation (for a scenario, the trade-off justification). French. */
  explanation: string
  /**
   * Multiple choice only, informational: (correct picks - wrong picks) / correct choices, floored
   * at 0. The mastery `score` stays all-or-nothing. Null for the other types.
   */
  partialCredit: number | null
}

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
  /** Questions left out of the score because their type has no grader yet (free answer). */
  skippedQuestionIds: number[]
}

export interface SubmittedAnswer {
  questionId: number
  answer: QuestionAnswer
}
