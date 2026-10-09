// Lesson flow behind `lesson:start`: Notion Outline (generated once), streamed Lesson (Content
// Cache), recorded `lessons` row, then the quiz Pre-generation. Plus the topic read channels.
import { z } from 'zod'
import type { Corpus } from '../corpus'
import {
  createLesson,
  getTopic,
  listLessonsByTopic,
  listNotionsByTopic
} from '../db/repositories/learningContent'
import { GenerationError, toGenerationError } from '../generation/errors'
import type { GenerationClient } from '../generation/ipc'
import {
  ensureNotionOutline,
  prepareLesson,
  prepareQuiz,
  type PipelineDeps
} from '../generation/pipelines'
import { sendEvent } from '../ipc/sendEvent'
import type { GenerationErrorInfo, GenerationOutput } from '../../shared/generation'
import type {
  LessonCancelRequest,
  LessonEvent,
  LessonSource,
  LessonStartRequest
} from '../../shared/lesson'
import type { TopicDetail, TopicGetRequest, TopicSummary } from '../../shared/topic'
import { getTopicDetail, listTopicSummaries, toNotionRef } from './topics'

// The renderer is not trusted to send well-formed requests: validate before use.
const topicIdSchema = z.number().int().positive()
const startRequestSchema = z.object({
  requestId: z.string().min(1).max(100),
  topicId: topicIdSchema
})
const cancelRequestSchema = z.object({ requestId: z.string() })
const getRequestSchema = z.object({ topicId: topicIdSchema })

export interface LessonIpc {
  listTopics(): TopicSummary[]
  getTopic(request: TopicGetRequest): TopicDetail
  start(request: LessonStartRequest, client: GenerationClient): void
  cancel(request: LessonCancelRequest): void
}

/** Source chips of the sections a lesson is grounded on. */
export function lessonSources(corpus: Corpus, sectionIds: readonly string[]): LessonSource[] {
  return sectionIds.flatMap((sectionId) => {
    const section = corpus.getSection(sectionId)
    return section
      ? [{ sectionId, label: section.breadcrumb.join(' > '), url: section.source.url }]
      : []
  })
}

/** Rejects with a `cancelled` GenerationError as soon as `signal` aborts. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new GenerationError('cancelled'))
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new GenerationError('cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Typed error for the renderer. Non-Generation failures keep their message, code `unknown`. */
function toErrorInfo(error: unknown): GenerationErrorInfo {
  if (error instanceof GenerationError) return error.toInfo()
  if (error instanceof Error) return { code: 'unknown', message: error.message }
  return toGenerationError(error).toInfo()
}

export interface LessonIpcOptions {
  /** Called when the quiz Pre-generation fails (defaults to `console.error`). */
  onPregenerationError?: (error: unknown) => void
}

/**
 * Bridges the topic and lesson channels to the content pipelines. Lesson events go out on
 * `lesson:event`, tagged with the request id; runs of a closed window are cancelled.
 */
export function createLessonIpc(deps: PipelineDeps, options: LessonIpcOptions = {}): LessonIpc {
  const { db, corpus, service } = deps
  const onPregenerationError =
    options.onPregenerationError ??
    ((error: unknown) => console.error('Quiz pre-generation failed', error))
  const runs = new Map<string, AbortController>()

  /** The `lessons` row is what the learner saw; one per Content Cache entry. */
  function recordLesson(topicId: number, output: GenerationOutput): void {
    const known = listLessonsByTopic(db, topicId).some(
      (lesson) => lesson.contentCacheKey === output.cacheKey
    )
    if (known || typeof output.content !== 'string') return
    try {
      createLesson(db, {
        topicId,
        content: output.content,
        grounded: output.grounded,
        sourceSections: output.sourceSections,
        contentCacheKey: output.cacheKey
      })
    } catch (error) {
      // Only bookkeeping: the learner already has the lesson.
      console.error('Could not record the lesson', error)
    }
  }

  /**
   * Pre-generates the quiz of the lesson the learner is reading (answerable from it). A later
   * foreground `prepareQuiz(deps, topicId, { lessonMarkdown })` finds it in the Content Cache.
   */
  function pregenerateQuiz(topicId: number, lessonMarkdown: string): void {
    prepareQuiz(deps, topicId, { lessonMarkdown })
      .then((request) => service.pregenerate(request).result)
      .catch((error: unknown) => {
        if (!(error instanceof GenerationError && error.code === 'cancelled')) {
          onPregenerationError(error)
        }
      })
  }

  async function run(topicId: number, signal: AbortSignal, send: (event: LessonEvent) => void) {
    try {
      if (listNotionsByTopic(db, topicId).length === 0) {
        send({ type: 'notion_outline', status: 'generating' })
      }
      // Not tied to this request's signal: the outline is shared by concurrent requests and
      // needed anyway, so a cancelled request only stops waiting for it.
      const notions = await abortable(ensureNotionOutline(deps, topicId), signal)
      const request = await prepareLesson(deps, topicId, { signal })
      send({
        type: 'prepared',
        grounded: (request.groundedSourceSections ?? []).length > 0,
        notions: notions.map(toNotionRef),
        sources: lessonSources(corpus, request.groundedSourceSections ?? [])
      })
      for await (const event of service.generate(request).events) {
        send(event)
        if (event.type === 'done' && typeof event.output.content === 'string') {
          recordLesson(topicId, event.output)
          pregenerateQuiz(topicId, event.output.content)
        }
      }
    } catch (error) {
      send({ type: 'error', error: toErrorInfo(error) })
    }
  }

  return {
    listTopics: () => listTopicSummaries(db),

    getTopic(request) {
      const { topicId } = getRequestSchema.parse(request)
      const topic = getTopicDetail(db, topicId)
      if (!topic) throw new Error(`Topic ${topicId} does not exist.`)
      return topic
    },

    start(request, client) {
      const { requestId, topicId } = startRequestSchema.parse(request)
      if (runs.has(requestId)) throw new Error(`Lesson request ${requestId} is already running.`)
      if (!getTopic(db, topicId)) throw new Error(`Topic ${topicId} does not exist.`)

      const controller = new AbortController()
      runs.set(requestId, controller)
      const abort = () => controller.abort()
      client.once('destroyed', abort)
      const send = (event: LessonEvent) => sendEvent(client, 'lesson:event', { requestId, event })

      void run(topicId, controller.signal, send).finally(() => {
        runs.delete(requestId)
        client.removeListener('destroyed', abort)
      })
    },

    cancel(request) {
      runs.get(cancelRequestSchema.parse(request).requestId)?.abort()
    }
  }
}
