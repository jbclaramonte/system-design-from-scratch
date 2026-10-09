import type { GenerationErrorCode, GenerationErrorInfo } from '../../../shared/generation'
import type { LessonEvent, LessonSource } from '../../../shared/lesson'
import type { NotionRef } from '../../../shared/topic'

/**
 * `starting`: request sent. `outline`: the Notion Outline is being generated (first open only).
 * `queued`: waiting for a CLI slot. `generating`: the CLI runs, text may be streaming.
 */
export type LessonStatus =
  'starting' | 'outline' | 'queued' | 'generating' | 'done' | 'cancelled' | 'error'

export interface LessonState {
  status: LessonStatus
  /** Markdown received so far; the full lesson once `done`. */
  text: string
  /** Null until the lesson is prepared. */
  grounded: boolean | null
  notions: NotionRef[]
  sources: LessonSource[]
  /** Null until `done`. */
  fromCache: boolean | null
  error: GenerationErrorInfo | null
}

export type LessonAction =
  | { type: 'event'; event: LessonEvent }
  /** A batch of streamed text (see `createTextBuffer`). */
  | { type: 'text'; text: string }

export const initialLessonState: LessonState = {
  status: 'starting',
  text: '',
  grounded: null,
  notions: [],
  sources: [],
  fromCache: null,
  error: null
}

export function lessonReducer(state: LessonState, action: LessonAction): LessonState {
  if (action.type === 'text') {
    return { ...state, status: 'generating', text: state.text + action.text }
  }
  const { event } = action
  switch (event.type) {
    case 'notion_outline':
      return { ...state, status: 'outline' }
    case 'prepared':
      return {
        ...state,
        grounded: event.grounded,
        notions: event.notions,
        sources: event.sources
      }
    case 'queued':
      return { ...state, status: 'queued' }
    case 'started':
      return { ...state, status: 'generating' }
    case 'text_delta':
      return { ...state, status: 'generating', text: state.text + event.text }
    case 'retry':
      // The new attempt streams the lesson again from the start.
      return { ...state, text: '' }
    case 'done':
      return {
        ...state,
        status: 'done',
        text: typeof event.output.content === 'string' ? event.output.content : state.text,
        grounded: event.output.grounded,
        fromCache: event.output.fromCache
      }
    case 'error':
      return {
        ...state,
        status: event.error.code === 'cancelled' ? 'cancelled' : 'error',
        error: event.error
      }
  }
}

/** True while the request can still be cancelled. */
export const isLessonRunning = (status: LessonStatus) =>
  status !== 'done' && status !== 'cancelled' && status !== 'error'

const errorTitles: Record<GenerationErrorCode, string> = {
  cli_not_found: 'Claude Code CLI not found',
  not_logged_in: 'Claude Code is not logged in',
  quota_or_rate_limit: 'Claude usage limit reached',
  bad_model: 'Model not available',
  timeout: 'The lesson took too long',
  invalid_output: 'The generated lesson was invalid',
  cancelled: 'Lesson cancelled',
  unknown: 'The lesson could not be generated'
}

export const errorTitle = (code: GenerationErrorCode) => errorTitles[code]
