// Lesson Question over IPC (#52): a question about a passage selected in a Lesson, a Remediation
// Lesson or a Protocol Step Lesson. The answer is a streamed Generation (kind `lesson_question`,
// not stored in the Content Cache) sent on `lessonQuestion:event` as the events of a lesson. The
// thread lives in the renderer and is sent back with each question: nothing is persisted, and a
// Lesson Question never touches the quiz, round or mastery tables.
import { z } from 'zod'
import { lessonSources, toErrorInfo } from '../content/lessonIpc'
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { hasOpenRound } from '../db/repositories/assessment'
import { getNotion, getTopic } from '../db/repositories/learningContent'
import { getGenerationLanguage } from '../db/repositories/settings'
import type { GenerationClient } from '../generation/ipc'
import { notionGrounding, topicGrounding } from '../generation/pipelines'
import {
  buildLessonQuestionGeneration,
  LESSON_QUESTION_TIMEOUT_MS,
  protocolStepLessonExcerpts,
  type GroundingInput,
  type LessonQuestionBrief
} from '../generation/prompts'
import type { GenerationService } from '../generation/service'
import type { TopicLockGuard } from '../path/lock'
import { sendEvent } from '../ipc/sendEvent'
import {
  LESSON_QUESTION_MAX_LESSON,
  LESSON_QUESTION_MAX_PREVIOUS_ANSWER,
  LESSON_QUESTION_MAX_QUESTION,
  LESSON_QUESTION_MAX_SELECTION,
  LESSON_QUESTION_MAX_THREAD,
  type LessonQuestionAskRequest,
  type LessonQuestionCancelRequest,
  type LessonQuestionContext
} from '../../shared/lessonQuestion'
import type { LessonEvent } from '../../shared/lesson'
import { PROTOCOL_STEP_DEFINITIONS, protocolSteps } from '../../shared/protocol'

// The renderer is not trusted to send well-formed requests: validate before use.
const id = z.number().int().positive()
const text = (max: number) => z.string().trim().min(1).max(max)
const askRequestSchema = z.object({
  requestId: z.string().min(1).max(100),
  context: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('lesson'), topicId: id }),
    z.object({ kind: z.literal('remediation'), topicId: id, notionId: id }),
    z.object({ kind: z.literal('protocol_step'), step: z.enum(protocolSteps) })
  ]),
  lesson: text(LESSON_QUESTION_MAX_LESSON),
  selection: text(LESSON_QUESTION_MAX_SELECTION),
  question: text(LESSON_QUESTION_MAX_QUESTION),
  thread: z
    .array(
      z.object({
        selection: text(LESSON_QUESTION_MAX_SELECTION),
        question: text(LESSON_QUESTION_MAX_QUESTION),
        // The thread keeps whole answers; the prompt clips them.
        answer: z.string().max(LESSON_QUESTION_MAX_PREVIOUS_ANSWER * 10)
      })
    )
    .max(LESSON_QUESTION_MAX_THREAD * 10)
})
const cancelRequestSchema = z.object({ requestId: z.string() })

export interface LessonQuestionIpc {
  ask(request: LessonQuestionAskRequest, client: GenerationClient): void
  cancel(request: LessonQuestionCancelRequest): void
}

export interface LessonQuestionDeps {
  db: Database
  corpus: Corpus
  service: Pick<GenerationService, 'generate'>
}

/** What the answer is about and grounded on. */
interface Subject {
  brief: LessonQuestionBrief
  grounding: GroundingInput
}

export const OPEN_ROUND_REFUSAL =
  'A Lesson Question is not available while a Quiz round of this topic is open. Finish the round first.'

/**
 * The text kind, title and Excerpts of the context. A Lesson Question is refused while a Quiz
 * round of the topic is open (the answer could give away quiz answers), whatever the renderer
 * shows; the Learning Path lock applies as for the Lesson.
 */
function resolveSubject(
  { db, corpus }: LessonQuestionDeps,
  context: LessonQuestionContext,
  assertTopicUnlocked: TopicLockGuard
): Subject {
  if (context.kind === 'protocol_step') {
    return {
      brief: {
        textKind: 'protocol_step_lesson',
        title: PROTOCOL_STEP_DEFINITIONS[context.step].title
      },
      grounding: {
        excerpts: protocolStepLessonExcerpts(
          context.step,
          (sectionId) => corpus.findExcerpts({ sectionIds: [sectionId], limit: 1 })[0]
        ),
        corpusVersion: corpus.data.metadata.commitSha
      }
    }
  }

  const topic = getTopic(db, context.topicId)
  if (!topic) throw new Error(`Topic ${context.topicId} does not exist.`)
  assertTopicUnlocked(topic.id)
  if (hasOpenRound(db, topic.id)) throw new Error(OPEN_ROUND_REFUSAL)

  if (context.kind === 'lesson') {
    return {
      brief: { textKind: 'lesson', title: topic.title },
      grounding: topicGrounding(corpus, topic)
    }
  }
  const notion = getNotion(db, context.notionId)
  if (!notion || notion.topicId !== topic.id) {
    throw new Error(`Notion ${context.notionId} is not a notion of topic ${topic.id}.`)
  }
  return {
    brief: { textKind: 'remediation_lesson', title: notion.title },
    grounding: notionGrounding(corpus, notion)
  }
}

/**
 * Bridges `lessonQuestion:ask` / `lessonQuestion:cancel` to the Generation Service. Events go out
 * on `lessonQuestion:event`, tagged with the request id: `prepared` (the sources the answer may
 * cite), then the Generation events. Runs of a closed window are cancelled.
 */
export function createLessonQuestionIpc(
  deps: LessonQuestionDeps,
  { assertTopicUnlocked = () => {} }: { assertTopicUnlocked?: TopicLockGuard } = {}
): LessonQuestionIpc {
  const runs = new Map<string, AbortController>()

  async function run(
    subject: Subject,
    request: z.infer<typeof askRequestSchema>,
    signal: AbortSignal,
    send: (event: LessonEvent) => void
  ) {
    try {
      // The Generation Language when the question is asked, not the one of the text read.
      const build = buildLessonQuestionGeneration(
        subject.brief,
        request,
        subject.grounding,
        getGenerationLanguage(deps.db)
      )
      send({
        type: 'prepared',
        grounded: build.groundedSourceSections.length > 0,
        notions: [],
        sources: lessonSources(deps.corpus, build.groundedSourceSections)
      })
      const generation = deps.service.generate({
        kind: build.kind,
        language: build.language,
        input: build.input,
        prompt: build.prompt,
        groundedSourceSections: build.groundedSourceSections,
        priority: 'foreground',
        signal,
        timeoutMs: LESSON_QUESTION_TIMEOUT_MS
      })
      for await (const event of generation.events) send(event)
    } catch (error) {
      send({ type: 'error', error: toErrorInfo(error) })
    }
  }

  return {
    ask(rawRequest, client) {
      const request = askRequestSchema.parse(rawRequest)
      if (runs.has(request.requestId)) {
        throw new Error(`Lesson Question request ${request.requestId} is already running.`)
      }
      const subject = resolveSubject(deps, request.context, assertTopicUnlocked)

      const controller = new AbortController()
      runs.set(request.requestId, controller)
      const abort = () => controller.abort()
      client.once('destroyed', abort)
      const send = (event: LessonEvent) =>
        sendEvent(client, 'lessonQuestion:event', { requestId: request.requestId, event })

      void run(subject, request, controller.signal, send).finally(() => {
        runs.delete(request.requestId)
        client.removeListener('destroyed', abort)
      })
    },

    cancel(request) {
      runs.get(cancelRequestSchema.parse(request).requestId)?.abort()
    }
  }
}
