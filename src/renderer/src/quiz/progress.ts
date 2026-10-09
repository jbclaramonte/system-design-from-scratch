import type { QuestionView } from '../../../shared/quiz'

/**
 * Index of the question to show: the first one neither answered nor skipped, or
 * `questions.length` when the quiz is done.
 */
export function nextQuestionIndex(
  questions: readonly QuestionView[],
  answered: ReadonlySet<number>,
  skipped: ReadonlySet<number>
): number {
  const index = questions.findIndex((q) => !answered.has(q.id) && !skipped.has(q.id))
  return index === -1 ? questions.length : index
}

/** Whether every gradable question has been answered, so the Round can be completed. */
export const allGradableAnswered = (
  questions: readonly QuestionView[],
  answered: ReadonlySet<number>
): boolean => questions.every((q) => !q.gradable || answered.has(q.id))

/** Toggles a choice: replaces the selection for a single answer, adds or removes otherwise. */
export function toggleChoice(
  selected: readonly number[],
  index: number,
  multiple: boolean
): number[] {
  if (!multiple) return [index]
  return selected.includes(index)
    ? selected.filter((i) => i !== index)
    : [...selected, index].sort((a, b) => a - b)
}

/** A percentage for display: whole numbers as is, others with one decimal. */
export const formatPercent = (value: number): string =>
  `${Number.isInteger(value) ? value : value.toFixed(1)}%`
