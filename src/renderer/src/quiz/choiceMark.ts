import type { ChoiceFeedbackItem, QuestionType } from '../../../shared/quiz'

/**
 * How a choice reads once the question is answered. Never by color alone: every state has a label
 * and a glyph.
 * - `correct`: picked, and part of the answer key.
 * - `wrong`: picked, and not part of the answer key.
 * - `missed`: part of the answer key of a multiple choice, and not picked.
 * - `answer`: the correct choice of a single choice or scenario, when another one was picked.
 * - `neutral`: not picked and not correct.
 */
export type ChoiceState = 'correct' | 'wrong' | 'missed' | 'answer' | 'neutral'

export interface ChoiceMark {
  state: ChoiceState
  /** Short label of the state, or null for `neutral`. */
  label: string | null
  /** Decorative glyph shown beside the label. */
  glyph: string
}

export function choiceMark(choice: ChoiceFeedbackItem, type: QuestionType): ChoiceMark {
  if (choice.selected) {
    return choice.correct
      ? { state: 'correct', label: 'Correct', glyph: '✓' }
      : { state: 'wrong', label: 'Wrong', glyph: '✕' }
  }
  if (choice.correct) {
    return type === 'multiple_choice'
      ? { state: 'missed', label: 'Missed', glyph: '!' }
      : { state: 'answer', label: 'Correct answer', glyph: '✓' }
  }
  return { state: 'neutral', label: null, glyph: '' }
}
