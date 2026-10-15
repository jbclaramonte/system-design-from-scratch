// Pure logic of the Lesson Question feature (#52): what counts as a quotable passage, the Ask
// shortcut, where the Ask button goes, and the in-memory thread of a panel. No DOM, no IPC.
import {
  LESSON_QUESTION_MAX_SELECTION,
  LESSON_QUESTION_MAX_THREAD,
  type LessonQuestionExchange
} from '../../../../shared/lessonQuestion'
import {
  initialLessonState,
  isLessonRunning,
  lessonReducer,
  type LessonAction,
  type LessonState
} from '../lessonState'

/** Shortest selection worth a question: a word or two, not a stray click. */
export const MIN_PASSAGE_LENGTH = 3

/**
 * The quotable passage of a raw selection (`Selection.toString()`): blanks collapsed, trimmed, cut
 * to the length the main process accepts. Null when there is nothing to ask about.
 */
export function toPassage(raw: string): string | null {
  const text = raw
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text.length < MIN_PASSAGE_LENGTH) return null
  return text.length > LESSON_QUESTION_MAX_SELECTION
    ? `${text.slice(0, LESSON_QUESTION_MAX_SELECTION - 1).trimEnd()}…`
    : text
}

/** Ctrl+Shift+A (Cmd+Shift+A on macOS): ask about the current selection. */
export function isAskShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>
): boolean {
  return (
    event.shiftKey &&
    !event.altKey &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'a'
  )
}

export interface Rect {
  right: number
  bottom: number
}

export interface ViewportSize {
  width: number
  height: number
}

/** Room the Ask button needs, in px. */
export const ASK_BUTTON_SIZE = { width: 64, height: 32 }
const ASK_BUTTON_GAP = 6

/**
 * Where the fixed Ask button goes: just under the end of the selection, kept inside the window
 * (above the selection when there is no room below).
 */
export function askButtonPosition(
  end: Rect,
  viewport: ViewportSize,
  size = ASK_BUTTON_SIZE
): { top: number; left: number } {
  const below = end.bottom + ASK_BUTTON_GAP
  const top =
    below + size.height <= viewport.height
      ? below
      : Math.max(0, end.bottom - size.height - ASK_BUTTON_GAP * 3)
  const left = Math.min(Math.max(0, end.right), Math.max(0, viewport.width - size.width))
  return { top, left }
}

// The thread of a panel: kept in memory, discarded with the panel.

export interface QuestionExchange {
  /** Stable across retries. */
  id: string
  /** The quoted passage this question is about. */
  selection: string
  question: string
  /** The streamed answer, in the state of a lesson stream. */
  answer: LessonState
  /** The main process refused the call (the message is a plain sentence), no Generation ran. */
  refusal: string | null
}

export interface ThreadState {
  exchanges: QuestionExchange[]
}

export const emptyThread: ThreadState = { exchanges: [] }

export type ThreadAction =
  | { type: 'ask'; id: string; selection: string; question: string }
  | { type: 'answer'; id: string; action: LessonAction }
  | { type: 'refused'; id: string; message: string }
  | { type: 'retry'; id: string }

const update = (
  state: ThreadState,
  id: string,
  change: (exchange: QuestionExchange) => QuestionExchange
): ThreadState => ({
  exchanges: state.exchanges.map((exchange) => (exchange.id === id ? change(exchange) : exchange))
})

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'ask':
      return {
        exchanges: [
          ...state.exchanges,
          {
            id: action.id,
            selection: action.selection,
            question: action.question,
            answer: initialLessonState,
            refusal: null
          }
        ]
      }
    case 'answer':
      return update(state, action.id, (exchange) => ({
        ...exchange,
        answer: lessonReducer(exchange.answer, action.action)
      }))
    case 'refused':
      return update(state, action.id, (exchange) => ({ ...exchange, refusal: action.message }))
    case 'retry':
      return update(state, action.id, (exchange) => ({
        ...exchange,
        answer: initialLessonState,
        refusal: null
      }))
  }
}

/** True while an answer is being generated (or the call is being sent). */
export const isAnswering = ({ exchanges }: ThreadState): boolean =>
  exchanges.some((exchange) => exchange.refusal === null && isLessonRunning(exchange.answer.status))

/**
 * The finished exchanges before `id`, as the main process wants them for a follow-up: oldest
 * first, only the answers that completed, at most the last few (the prompt takes the same).
 */
export function exchangesBefore(state: ThreadState, id: string): LessonQuestionExchange[] {
  const index = state.exchanges.findIndex((exchange) => exchange.id === id)
  return state.exchanges
    .slice(0, index === -1 ? state.exchanges.length : index)
    .filter((exchange) => exchange.answer.status === 'done')
    .map(({ selection, question, answer }) => ({ selection, question, answer: answer.text }))
    .slice(-LESSON_QUESTION_MAX_THREAD)
}
