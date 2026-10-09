/** Lesson stream types shared by the main process (src/main/content) and the Lesson view. */
import type { GenerationEvent } from './generation'
import type { NotionRef } from './topic'

/** A Source Corpus section a lesson may cite, ready to show as a source chip. */
export interface LessonSource {
  /** Corpus section id, as cited inline: `[source: cache/when-to-update-the-cache]`. */
  sectionId: string
  /** Heading breadcrumb, for example `Cache > When to update the cache`. */
  label: string
  /** Permalink of the section in the primer at the pinned commit. */
  url: string
}

/**
 * Events of one lesson request, in order: `notion_outline` (only when the outline must be
 * generated first), `prepared`, then the Generation events of the lesson (`queued`, `started`,
 * `text_delta`, `retry`, then `done` or `error`). An `error` can also end the stream before
 * `prepared` (outline failure, cancellation).
 */
export type LessonEvent =
  | { type: 'notion_outline'; status: 'generating' }
  | {
      type: 'prepared'
      /** False for Foundations Module topics (ungrounded, outside the primer). */
      grounded: boolean
      notions: NotionRef[]
      /** The sections the lesson was grounded on; empty when ungrounded. */
      sources: LessonSource[]
    }
  | GenerationEvent

export interface LessonStartRequest {
  /** Chosen by the renderer (`crypto.randomUUID()`), tags every event of the request. */
  requestId: string
  topicId: number
}

export interface LessonCancelRequest {
  requestId: string
}

export interface LessonStreamEvent {
  requestId: string
  event: LessonEvent
}
