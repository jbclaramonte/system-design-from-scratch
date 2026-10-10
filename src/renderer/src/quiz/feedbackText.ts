import type { AttemptResult, ChoiceFeedbackItem } from '../../../shared/quiz'

/**
 * Result labels shown to the learner. `partially_correct` stays the stored value; the learner reads
 * "Not quite", because such an answer scores 0 and counts as missed (all-or-nothing scoring).
 */
export const resultLabels: Record<AttemptResult, string> = {
  correct: 'Correct',
  partially_correct: 'Not quite',
  incorrect: 'Incorrect'
}

/** What the learner picked on a choice question, against the answer key. */
export interface ChoiceTally {
  correctPicked: number
  correctTotal: number
  wrongPicked: number
}

export function choiceTally(choices: readonly ChoiceFeedbackItem[]): ChoiceTally {
  return {
    correctPicked: choices.filter((choice) => choice.correct && choice.selected).length,
    correctTotal: choices.filter((choice) => choice.correct).length,
    wrongPicked: choices.filter((choice) => !choice.correct && choice.selected).length
  }
}

/** The verdict line of an answered question: a label, then what happened, or null. */
export interface FeedbackMessage {
  label: string
  detail: string | null
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const allOf = (n: number) => (n === 2 ? 'both' : `all ${n}`)

const ALL_OR_NOTHING =
  'You need all of them, and none of the wrong ones, to validate this question.'

/**
 * The verdict of a choice question, from what was picked. A single choice or a scenario has one
 * correct choice: no detail beyond the label. A multiple choice says what was found, what was
 * missed or picked wrongly, and why it still counts as missed.
 */
export function choiceFeedbackMessage({
  correctPicked,
  correctTotal,
  wrongPicked
}: ChoiceTally): FeedbackMessage {
  const missed = correctTotal - correctPicked
  if (missed === 0 && wrongPicked === 0) {
    return {
      label: resultLabels.correct,
      detail: correctTotal > 1 ? `you found ${allOf(correctTotal)} correct answers.` : null
    }
  }
  if (correctTotal <= 1) return { label: resultLabels.incorrect, detail: null }
  const wrong = count(wrongPicked, 'wrong answer', 'wrong answers')
  if (correctPicked === 0) {
    return {
      label: resultLabels.incorrect,
      detail: `you found none of the ${correctTotal} correct answers${wrongPicked > 0 ? ` and picked ${wrong}` : ''}. The correct ones are marked below.`
    }
  }
  const found =
    missed === 0
      ? `you found ${allOf(correctTotal)} correct answers but also picked ${wrong}.`
      : `you found ${correctPicked} of the ${correctTotal} correct answers${wrongPicked > 0 ? ` and picked ${wrong}` : ''}.`
  return { label: resultLabels.partially_correct, detail: `${found} ${ALL_OR_NOTHING}` }
}

/** The verdict of a graded free answer, from the expected points covered. */
export function freeAnswerFeedbackMessage(
  result: AttemptResult,
  covered: number,
  expected: number
): FeedbackMessage {
  if (result !== 'partially_correct') return { label: resultLabels[result], detail: null }
  return {
    label: resultLabels.partially_correct,
    detail: `you covered ${covered} of the ${count(expected, 'expected point', 'expected points')}. You need every expected point, without a major error, to validate this question.`
  }
}

/** "Label: detail" as one line. */
export const feedbackLine = ({ label, detail }: FeedbackMessage): string =>
  detail ? `${label}: ${detail}` : label
