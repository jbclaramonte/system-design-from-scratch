// Mastery Loop over IPC: topic list with mastery, loop state, round start (quiz prepared in the
// main process, answer keys never sent), streamed Remediation Lessons, Round Limit choice.
import { z } from 'zod'
import { lessonSources, toErrorInfo } from '../content/lessonIpc'
import { toNotionRef } from '../content/topics'
import type { GenerationClient } from '../generation/ipc'
import { sendEvent } from '../ipc/sendEvent'
import type { TopicLockGuard } from '../path/lock'
import {
  roundLimitChoices,
  type MasteryCancelRequest,
  type MasteryChooseRequest,
  type MasteryEvent,
  type MasteryRemediationRequest,
  type MasteryStartRoundRequest,
  type MasteryState,
  type MasteryTopicRequest,
  type TopicMasterySummary
} from '../../shared/mastery'
import type { MasteryService, MasteryServiceDeps } from './service'

// The renderer is not trusted to send well-formed requests: validate before use.
const id = z.number().int().positive()
const requestId = z.string().min(1).max(100)
const topicRequest = z.object({ topicId: id })
const startRoundRequest = z.object({ requestId, topicId: id })
const remediationRequest = z.object({ requestId, topicId: id, notionId: id })
const cancelRequest = z.object({ requestId: z.string() })
const chooseRequest = z.object({ topicId: id, choice: z.enum(roundLimitChoices) })

export interface MasteryIpc {
  listTopics(): TopicMasterySummary[]
  getState(request: MasteryTopicRequest): MasteryState
  startRound(request: MasteryStartRoundRequest, client: GenerationClient): void
  startRemediation(request: MasteryRemediationRequest, client: GenerationClient): void
  cancel(request: MasteryCancelRequest): void
  choose(request: MasteryChooseRequest): MasteryState
}

/**
 * Bridges the `mastery:*` channels to the Mastery Loop service. Events go out on
 * `mastery:event`, tagged with the request id; runs of a closed window are cancelled. A Round or
 * a Remediation Lesson of a topic locked on the Learning Path ends with a `topic_locked` error
 * (`assertTopicUnlocked`, see `createTopicLockGuard`).
 */
export function createMasteryIpc(
  deps: Pick<MasteryServiceDeps, 'db' | 'corpus' | 'service'>,
  mastery: MasteryService,
  { assertTopicUnlocked }: { assertTopicUnlocked: TopicLockGuard }
): MasteryIpc {
  const runs = new Map<string, AbortController>()

  /** Runs `body` as a cancellable request; any failure ends the stream with an `error` event. */
  function launch(
    id: string,
    client: GenerationClient,
    body: (signal: AbortSignal, send: (event: MasteryEvent) => void) => Promise<void>
  ) {
    if (runs.has(id)) throw new Error(`Mastery request ${id} is already running.`)
    const controller = new AbortController()
    runs.set(id, controller)
    const abort = () => controller.abort()
    client.once('destroyed', abort)
    const send = (event: MasteryEvent) =>
      sendEvent(client, 'mastery:event', { requestId: id, event })
    void body(controller.signal, send)
      .catch((error: unknown) => send({ type: 'error', error: toErrorInfo(error) }))
      .finally(() => {
        runs.delete(id)
        client.removeListener('destroyed', abort)
      })
  }

  return {
    listTopics: () => mastery.listTopics(),

    getState: (request) => mastery.getState(topicRequest.parse(request).topicId),

    startRound(request, client) {
      const { requestId: rid, topicId } = startRoundRequest.parse(request)
      mastery.getState(topicId)
      launch(rid, client, async (signal, send) => {
        assertTopicUnlocked(topicId)
        const start = await mastery.startRound(topicId, { signal, onEvent: send })
        send({ type: 'round_ready', start })
      })
    },

    startRemediation(request, client) {
      const { requestId: rid, topicId, notionId } = remediationRequest.parse(request)
      mastery.getState(topicId)
      launch(rid, client, async (signal, send) => {
        assertTopicUnlocked(topicId)
        const run = mastery.prepareRemediation(topicId, notionId, { signal })
        send({
          type: 'prepared',
          grounded: (run.request.groundedSourceSections ?? []).length > 0,
          notions: [toNotionRef(run.notion)],
          sources: lessonSources(deps.corpus, run.request.groundedSourceSections ?? [])
        })
        const generation = deps.service.generate(run.request)
        // The other Remediation Lessons and the next quiz, while this one is read.
        mastery.pregenerateRemediationStep(topicId, notionId)
        for await (const event of generation.events) {
          if (event.type === 'done') mastery.recordRemediation(run, event.output)
          send(event)
        }
      })
    },

    cancel(request) {
      runs.get(cancelRequest.parse(request).requestId)?.abort()
    },

    choose(request) {
      const { topicId, choice } = chooseRequest.parse(request)
      return mastery.choose(topicId, choice)
    }
  }
}
