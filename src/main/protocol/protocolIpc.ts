// Interview Protocol over IPC: exercise state, drafts, streamed Protocol Step Lessons (events on
// `protocol:event`), and Generation-backed calls (step feedback, Hints, final review) that answer
// a `ProtocolOutcome`. Every request carries a renderer-chosen id, cancellable with
// `protocol:cancel`; requests of a closed window are cancelled.
import { z } from 'zod'
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { lessonSources, toErrorInfo } from '../content/lessonIpc'
import type { GenerationClient } from '../generation/ipc'
import type { GenerationService } from '../generation/service'
import { sendEvent } from '../ipc/sendEvent'
import { designExportSchema } from '../../shared/designGraph'
import type { DesignExerciseRef } from '../../shared/ipc'
import type { LessonEvent } from '../../shared/lesson'
import {
  protocolSteps,
  type FinalReviewView,
  type HintView,
  type ProtocolCancelRequest,
  type ProtocolDevExerciseRequest,
  type ProtocolDraftRequest,
  type ProtocolExerciseRequest,
  type ProtocolExerciseView,
  type ProtocolFinalReviewRequest,
  type ProtocolHintRequest,
  type ProtocolLessonSeenRequest,
  type ProtocolOutcome,
  type ProtocolStepLessonRequest,
  type ProtocolSubmitRequest,
  type SubmissionView
} from '../../shared/protocol'
import { openDevProtocolExercise } from './exercises'
import { MAX_CANVAS_NOTES_LENGTH, MAX_STEP_TEXT_LENGTH, type ProtocolService } from './service'

// The renderer is not trusted to send well-formed requests: validate before use.
const id = z.number().int().positive()
const requestId = z.string().min(1).max(100)
const step = z.enum(protocolSteps)
const submission = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(MAX_STEP_TEXT_LENGTH) }),
  z.object({
    type: z.literal('canvas'),
    designExport: designExportSchema,
    notes: z.string().max(MAX_CANVAS_NOTES_LENGTH)
  })
])
const exerciseRequest = z.object({ designExerciseId: id })
const draftRequest = exerciseRequest.extend({
  step,
  text: z.string().max(MAX_STEP_TEXT_LENGTH)
})
const lessonSeenRequest = exerciseRequest.extend({ step })
const stepLessonRequest = z.object({ requestId, step })
const submitRequest = exerciseRequest.extend({ requestId, step, submission })
const hintRequest = exerciseRequest.extend({ requestId, step, current: submission })
const finalReviewRequest = exerciseRequest.extend({ requestId })
const cancelRequest = z.object({ requestId: z.string() })
const devExerciseRequest = z.object({ exerciseIndex: z.number().int().min(1).max(99) })

export interface ProtocolIpc {
  openDevExercise(request: ProtocolDevExerciseRequest): DesignExerciseRef
  getExercise(request: ProtocolExerciseRequest): ProtocolExerciseView
  saveDraft(request: ProtocolDraftRequest): void
  markLessonSeen(request: ProtocolLessonSeenRequest): ProtocolExerciseView
  startStepLesson(request: ProtocolStepLessonRequest, client: GenerationClient): void
  submitStep(
    request: ProtocolSubmitRequest,
    client: GenerationClient
  ): Promise<ProtocolOutcome<SubmissionView>>
  requestHint(
    request: ProtocolHintRequest,
    client: GenerationClient
  ): Promise<ProtocolOutcome<HintView>>
  requestFinalReview(
    request: ProtocolFinalReviewRequest,
    client: GenerationClient
  ): Promise<ProtocolOutcome<FinalReviewView>>
  cancel(request: ProtocolCancelRequest): void
}

/**
 * `allowDevFixture` is false in a packaged app. `assertExerciseUnlocked` (the Learning Path lock,
 * `createExerciseLockGuard`) runs before every entry of an exercise.
 */
export function createProtocolIpc(
  deps: { db: Database; corpus: Corpus; service: Pick<GenerationService, 'generate'> },
  protocol: ProtocolService,
  {
    allowDevFixture,
    assertExerciseUnlocked = () => {}
  }: { allowDevFixture: boolean; assertExerciseUnlocked?: (designExerciseId: number) => void }
): ProtocolIpc {
  const runs = new Map<string, AbortController>()
  const unlocked = <T extends { designExerciseId: number }>(parsed: T): T => {
    assertExerciseUnlocked(parsed.designExerciseId)
    return parsed
  }

  /** Runs `body` with an AbortSignal tied to `protocol:cancel` and to the window. */
  async function cancellable<T>(
    rid: string,
    client: GenerationClient,
    body: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (runs.has(rid)) throw new Error(`Protocol request ${rid} is already running.`)
    const controller = new AbortController()
    runs.set(rid, controller)
    const abort = () => controller.abort()
    client.once('destroyed', abort)
    try {
      return await body(controller.signal)
    } finally {
      runs.delete(rid)
      client.removeListener('destroyed', abort)
    }
  }

  return {
    openDevExercise(request) {
      if (!allowDevFixture) throw new Error('The dev design exercises are only available in dev')
      const exercise = openDevProtocolExercise(
        deps.db,
        deps.corpus,
        devExerciseRequest.parse(request).exerciseIndex
      )
      return { id: exercise.id, slug: exercise.slug, title: exercise.title }
    },

    getExercise: (request) =>
      protocol.getExercise(unlocked(exerciseRequest.parse(request)).designExerciseId),

    saveDraft(request) {
      const { designExerciseId, step: s, text } = unlocked(draftRequest.parse(request))
      protocol.saveDraft(designExerciseId, s, text)
    },

    markLessonSeen(request) {
      const { designExerciseId, step: s } = unlocked(lessonSeenRequest.parse(request))
      return protocol.markLessonSeen(designExerciseId, s)
    },

    startStepLesson(request, client) {
      const { requestId: rid, step: s } = stepLessonRequest.parse(request)
      const send = (event: LessonEvent) =>
        sendEvent(client, 'protocol:event', { requestId: rid, event })
      void cancellable(rid, client, async (signal) => {
        const run = protocol.prepareStepLesson(s)
        send({
          type: 'prepared',
          grounded: run.sourceSections.length > 0,
          notions: [],
          sources: lessonSources(deps.corpus, run.sourceSections)
        })
        const generation = deps.service.generate({ ...run.request, signal })
        for await (const event of generation.events) send(event)
      }).catch((error: unknown) => send({ type: 'error', error: toErrorInfo(error) }))
    },

    async submitStep(request, client) {
      const parsed = unlocked(submitRequest.parse(request))
      return cancellable(parsed.requestId, client, (signal) =>
        protocol.submitStep(parsed.designExerciseId, parsed.step, parsed.submission, signal)
      )
    },

    async requestHint(request, client) {
      const parsed = unlocked(hintRequest.parse(request))
      return cancellable(parsed.requestId, client, (signal) =>
        protocol.requestHint(parsed.designExerciseId, parsed.step, parsed.current, signal)
      )
    },

    async requestFinalReview(request, client) {
      const parsed = unlocked(finalReviewRequest.parse(request))
      return cancellable(parsed.requestId, client, (signal) =>
        protocol.requestFinalReview(parsed.designExerciseId, signal)
      )
    },

    cancel(request) {
      runs.get(cancelRequest.parse(request).requestId)?.abort()
    }
  }
}
