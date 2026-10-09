// Deterministic local grading of choice questions (single choice, multiple choice, scenario),
// the free-answer pieces that need no Generation (answer checks, verdict to score, feedback from
// the stored grading), quiz and per-notion scores. Pure: no database, no Electron. Rules in
// docs/Quiz Engine.md.
import { z } from 'zod'
import type { Json } from '../../shared/json'
import {
  FREE_ANSWER_MAX_LENGTH,
  type AttemptResult,
  type ChoiceAnswer,
  type ChoiceQuestionFeedback,
  type ExpectedPointFeedback,
  type FreeAnswer,
  type FreeAnswerGrading,
  type FreeAnswerGradingRecord,
  type FreeAnswerQuestionFeedback,
  type GradingResult,
  type LocallyGradedType,
  type NotionRef,
  type NotionScore,
  type QuestionType
} from '../../shared/quiz'

/** An answer the grader refuses (malformed, unknown choice): nothing is recorded. */
export class InvalidAnswerError extends Error {
  override name = 'InvalidAnswerError'
}

/** `questions.body` of a choice question, as stored by `saveQuiz` (see docs/Prompts.md). */
const choiceBodySchema = z.object({
  choices: z.array(z.object({ text: z.string(), correct: z.boolean() })).min(2),
  explanation: z.string(),
  scenario: z.string().optional()
})
export type ChoiceBody = z.infer<typeof choiceBodySchema>

export function parseChoiceBody(body: Json): ChoiceBody {
  return choiceBodySchema.parse(body)
}

/** The fields of a stored question a grader needs. */
export interface GradableQuestion {
  id: number
  type: QuestionType
  prompt: string
  body: Json
}

export interface GradedAnswer {
  grading: GradingResult
  /** The answer as stored on the Attempt (normalized). */
  answer: Json
  feedback: ChoiceQuestionFeedback
}

/**
 * A synchronous grader for one question type. `free_answer` has none: it is graded by a
 * Generation (`FreeAnswerGrader` in `freeAnswerGrader.ts`), asynchronously, by the quiz service.
 */
export interface Grader {
  grade(question: GradableQuestion, answer: unknown): GradedAnswer
}

const answerSchema = z.object({ selected: z.array(z.number()) })

/**
 * Validates a choice answer against the question's choices: indexes must be integers of the
 * choice list, at least one is required; duplicates are collapsed. Returns sorted indexes.
 */
export function normalizeChoiceAnswer(answer: unknown, choiceCount: number): ChoiceAnswer {
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success) throw new InvalidAnswerError('An answer must be { selected: number[] }.')
  const selected = [...new Set(parsed.data.selected)].sort((a, b) => a - b)
  for (const index of selected) {
    if (!Number.isInteger(index) || index < 0 || index >= choiceCount) {
      throw new InvalidAnswerError(`Unknown choice ${index}.`)
    }
  }
  if (selected.length === 0) throw new InvalidAnswerError('Select at least one choice.')
  return { selected }
}

function choiceFeedback(
  question: GradableQuestion,
  body: ChoiceBody,
  selected: readonly number[],
  grading: GradingResult,
  partialCredit: number | null
): ChoiceQuestionFeedback {
  return {
    questionId: question.id,
    type: question.type,
    prompt: question.prompt,
    kind: 'choice',
    ...grading,
    choices: body.choices.map((choice, index) => ({
      text: choice.text,
      correct: choice.correct,
      selected: selected.includes(index)
    })),
    scenario: body.scenario ?? null,
    explanation: body.explanation,
    partialCredit
  }
}

/** Single choice and scenario: exactly one choice, right or wrong. */
const singleChoiceGrader: Grader = {
  grade(question, raw) {
    const body = parseChoiceBody(question.body)
    const { selected } = normalizeChoiceAnswer(raw, body.choices.length)
    if (selected.length > 1) {
      throw new InvalidAnswerError(`A ${question.type} question takes exactly one choice.`)
    }
    const correct = body.choices[selected[0]!]!.correct
    const grading: GradingResult = {
      result: correct ? 'correct' : 'incorrect',
      score: correct ? 1 : 0,
      feedback: null
    }
    return {
      grading,
      answer: { selected },
      feedback: choiceFeedback(question, body, selected, grading, null)
    }
  }
}

/**
 * Multiple choice, all-or-nothing for mastery: score 1 only when the selection is exactly the set
 * of correct choices. `partially_correct` when at least one correct choice was picked but the
 * selection is not exact (missing or extra picks); its score is still 0. `partialCredit` tells
 * the learner how close they were.
 */
const multipleChoiceGrader: Grader = {
  grade(question, raw) {
    const body = parseChoiceBody(question.body)
    const { selected } = normalizeChoiceAnswer(raw, body.choices.length)
    const correctCount = body.choices.filter((choice) => choice.correct).length
    const hits = selected.filter((index) => body.choices[index]!.correct).length
    const wrongPicks = selected.length - hits
    const exact = hits === correctCount && wrongPicks === 0
    const grading: GradingResult = {
      result: exact ? 'correct' : hits > 0 ? 'partially_correct' : 'incorrect',
      score: exact ? 1 : 0,
      feedback: null
    }
    const partialCredit = correctCount === 0 ? 0 : Math.max(0, (hits - wrongPicks) / correctCount)
    return {
      grading,
      answer: { selected },
      feedback: choiceFeedback(question, body, selected, grading, partialCredit)
    }
  }
}

export const localGraders: Record<LocallyGradedType, Grader> = {
  single_choice: singleChoiceGrader,
  multiple_choice: multipleChoiceGrader,
  scenario: singleChoiceGrader
}

export type Graders = Partial<Record<QuestionType, Grader>>

/** Grades an answer with the grader of the question type. Throws when the type has none. */
export function gradeAnswer(
  question: GradableQuestion,
  answer: unknown,
  graders: Graders = localGraders
): GradedAnswer {
  const grader = graders[question.type]
  if (!grader) {
    throw new Error(
      question.type === 'free_answer'
        ? 'Free answers are graded by a Generation: submit them one at a time.'
        : `No grader for ${question.type} questions.`
    )
  }
  return grader.grade(question, answer)
}

// Free answers

/** `questions.body` of a free-answer question, as stored by `saveQuiz` (see docs/Prompts.md). */
const freeAnswerBodySchema = z.object({
  expectedPoints: z.array(z.string().min(1)).min(1),
  modelAnswer: z.string()
})
export type FreeAnswerBody = z.infer<typeof freeAnswerBodySchema>

export function parseFreeAnswerBody(body: Json): FreeAnswerBody {
  return freeAnswerBodySchema.parse(body)
}

/**
 * Validates a free answer: `{ text }`, trimmed, not empty, at most `FREE_ANSWER_MAX_LENGTH`
 * characters. Checked before any Generation, so a refused answer costs nothing.
 */
export function normalizeFreeAnswer(answer: unknown): FreeAnswer {
  const parsed = z.object({ text: z.string() }).safeParse(answer)
  if (!parsed.success) throw new InvalidAnswerError('A free answer must be { text: string }.')
  const text = parsed.data.text.trim()
  if (text.length === 0) throw new InvalidAnswerError('Write an answer first.')
  if (text.length > FREE_ANSWER_MAX_LENGTH) {
    throw new InvalidAnswerError(`An answer is at most ${FREE_ANSWER_MAX_LENGTH} characters.`)
  }
  return { text }
}

/**
 * Mastery credit of a free-answer verdict: all-or-nothing, like multiple choice. A
 * `partially_correct` answer scores 0, so its notions go to remediation.
 */
export const verdictScore = (verdict: AttemptResult): number => (verdict === 'correct' ? 1 : 0)

/** Informational closeness of a free answer: covered expected points over expected points. */
export const coveredShare = (grading: FreeAnswerGrading): number =>
  grading.expectedPoints.length === 0
    ? 0
    : grading.expectedPoints.filter((point) => point.covered).length / grading.expectedPoints.length

const gradingSchema = z.object({
  verdict: z.enum(['correct', 'partially_correct', 'incorrect']),
  expectedPoints: z.array(z.object({ covered: z.boolean(), justification: z.string() })),
  misconceptions: z.array(z.string()),
  explanation: z.string(),
  toReview: z.array(z.string())
})

const gradingRecordSchema = z.object({
  promptVersion: z.string(),
  grading: gradingSchema,
  contest: z.object({ justification: z.string(), contestedAt: z.string() }).nullable(),
  history: z.array(z.object({ promptVersion: z.string(), grading: gradingSchema }))
})

/** The grading record stored as JSON in `attempts.feedback`. */
export function parseGradingRecord(feedback: string | null): FreeAnswerGradingRecord {
  if (feedback === null) throw new Error('A free-answer attempt has no grading.')
  return gradingRecordSchema.parse(JSON.parse(feedback))
}

/** What the Attempt stores for a free-answer grading record. */
export const recordGradingResult = (record: FreeAnswerGradingRecord): GradingResult => ({
  result: record.grading.verdict,
  score: verdictScore(record.grading.verdict),
  feedback: JSON.stringify(record)
})

const pointFeedback = (body: FreeAnswerBody, grading: FreeAnswerGrading): ExpectedPointFeedback[] =>
  body.expectedPoints.map((point, index) => ({
    point,
    covered: grading.expectedPoints[index]?.covered ?? false,
    justification: grading.expectedPoints[index]?.justification ?? ''
  }))

/**
 * Feedback on a graded free answer, from its stored record: the grading in force, the expected
 * points with their coverage, and the model answer (revealed only once graded).
 */
export function freeAnswerFeedback(
  question: GradableQuestion,
  answer: string,
  record: FreeAnswerGradingRecord,
  { contestable }: { contestable: boolean }
): FreeAnswerQuestionFeedback {
  const body = parseFreeAnswerBody(question.body)
  const { grading, contest, history } = record
  const previous = history.at(-1)?.grading
  return {
    questionId: question.id,
    type: question.type,
    prompt: question.prompt,
    kind: 'free_answer',
    ...recordGradingResult(record),
    feedback: grading.explanation,
    partialCredit: coveredShare(grading),
    answer,
    expectedPoints: pointFeedback(body, grading),
    misconceptions: grading.misconceptions,
    explanation: grading.explanation,
    toReview: grading.toReview,
    modelAnswer: body.modelAnswer,
    contest:
      contest && previous
        ? {
            justification: contest.justification,
            previous: {
              result: previous.verdict,
              expectedPoints: pointFeedback(body, previous),
              explanation: previous.explanation
            }
          }
        : null,
    contestable: contestable && grading.verdict !== 'correct' && contest === null
  }
}

/** One graded question, for the scores. */
export interface ScoredQuestion {
  score: number
  notionIds: readonly number[]
}

/**
 * Quiz score in percent: the sum of question scores over the number of questions, times 100.
 * Computed as `earned * 100 / count` so whole results stay exact (29 of 100 is 29, not 28.99...).
 */
export function quizScorePercent(questions: readonly ScoredQuestion[]): number {
  if (questions.length === 0) throw new Error('A quiz score needs at least one graded question.')
  const earned = questions.reduce((sum, question) => sum + question.score, 0)
  return (earned * 100) / questions.length
}

/** Whether a score meets the Mastery Threshold (both in percent). */
export const meetsThreshold = (scorePercent: number, masteryThreshold: number): boolean =>
  scorePercent >= masteryThreshold

/**
 * Score per notion: a question tagged with several notions counts for each of them. Notions are
 * returned in the order given; notions with no question are left out.
 */
export function notionScores(
  questions: readonly ScoredQuestion[],
  notions: readonly NotionRef[]
): NotionScore[] {
  return notions.flatMap((notion) => {
    const tagged = questions.filter((question) => question.notionIds.includes(notion.id))
    if (tagged.length === 0) return []
    const earned = tagged.reduce((sum, question) => sum + question.score, 0)
    return [
      {
        ...notion,
        questionCount: tagged.length,
        earned,
        scorePercent: (earned * 100) / tagged.length,
        missed: tagged.some((question) => question.score < 1)
      }
    ]
  })
}
