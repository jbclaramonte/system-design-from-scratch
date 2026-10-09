/**
 * Single source of truth for the IPC boundary between the renderer and the main process.
 *
 * To add a call: declare its channel in `IpcChannels`, map a `window.api` method to it in
 * `apiChannels`, then implement the handler in `src/main/ipc/handlers.ts` (the compiler
 * rejects a missing handler).
 *
 * To add an event pushed by the main process: declare it in `IpcEvents` and map a `window.api`
 * subscription method to it in `apiEvents`; the main process sends it with `sendEvent`.
 */

import type { GenerationEvent, GenerationKind, GenerationPriority, Json } from './generation'
import type { DesignExport, DesignExportSummary } from './designGraph'
import type { LessonCancelRequest, LessonStartRequest, LessonStreamEvent } from './lesson'
import type { TopicDetail, TopicGetRequest, TopicSummary } from './topic'
import type {
  MasteryCancelRequest,
  MasteryChooseRequest,
  MasteryRemediationRequest,
  MasteryStartRoundRequest,
  MasteryState,
  MasteryStreamEvent,
  MasteryTopicRequest,
  TopicMasterySummary
} from './mastery'
import type { AppSettings, CliCheck, CliCheckRequest } from './settings'
import type {
  FinalReviewView,
  HintView,
  ProtocolCancelRequest,
  ProtocolDevExerciseRequest,
  ProtocolDraftRequest,
  ProtocolExerciseRequest,
  ProtocolExerciseView,
  ProtocolFinalReviewRequest,
  ProtocolHintRequest,
  ProtocolLessonSeenRequest,
  ProtocolOutcome,
  ProtocolStepLessonRequest,
  ProtocolSubmitRequest,
  SubmissionView
} from './protocol'
import type { AboutInfo } from './about'
import type { LearningPath } from './learningPath'
import type { Dashboard, DashboardRequest } from './dashboard'
import type {
  FreeAnswerGradingOutcome,
  QuestionFeedback,
  QuizRef,
  QuizSummary,
  QuizTopic,
  QuizView,
  RoundResult,
  RoundStart,
  SubmittedAnswer
} from './quiz'

/** The fields of a Design Exercise the renderer needs to open its Design Canvas. */
export interface DesignExerciseRef {
  id: number
  slug: string
  title: string
}

export interface DesignSceneLoadRequest {
  designExerciseId: number
}

export interface DesignSceneSaveRequest {
  designExerciseId: number
  /** tldraw editor snapshot, see `src/renderer/src/design/sceneSnapshot.ts`. */
  snapshot: Json
}

export interface PingRequest {
  message: string
}

export interface PingResponse {
  reply: string
  receivedAt: string
}

export interface GenerationStartRequest {
  /**
   * Chosen by the renderer (`crypto.randomUUID()`), so it can match events that arrive before
   * the call returns.
   */
  requestId: string
  kind: GenerationKind
  input: Json
  /** Default `foreground`. */
  priority?: GenerationPriority
}

export interface GenerationCancelRequest {
  requestId: string
}

/** One Generation event, tagged with the request it belongs to. */
export interface GenerationStreamEvent {
  requestId: string
  event: GenerationEvent
}

/** Channel name to request and response types. Channel names are `domain:action`. */
export interface IpcChannels {
  'app:getVersion': { request: void; response: string }
  /** About screen: app version, primer attribution (corpus metadata), third-party licenses. */
  'app:getAbout': { request: void; response: AboutInfo }
  'system:ping': { request: PingRequest; response: PingResponse }
  /** Starts a Generation; its events follow on `generation:event`. */
  'generation:start': { request: GenerationStartRequest; response: void }
  'generation:cancel': { request: GenerationCancelRequest; response: void }
  /** Stored Design Scene snapshot of the exercise, or `null` when it has none yet. */
  'design:loadScene': { request: DesignSceneLoadRequest; response: Json | null }
  'design:saveScene': { request: DesignSceneSaveRequest; response: void }
  /** Dev only (rejected in a packaged app): gets or creates the scratch Design Exercise. */
  'design:openScratchExercise': { request: void; response: DesignExerciseRef }
  /** Hands a Design Export to the main process (validated; used by the evaluation, #14). */
  'design:exportScene': { request: DesignExport; response: DesignExportSummary }
  /** Topics in Learning Path order, with their mastery. */
  'mastery:listTopics': { request: void; response: TopicMasterySummary[] }
  /** Where the topic is in the Mastery Loop, derived from the database. */
  'mastery:getState': { request: MasteryTopicRequest; response: MasteryState }
  /** Resumes the open round or prepares and starts the next one; events on `mastery:event`. */
  'mastery:startRound': { request: MasteryStartRoundRequest; response: void }
  /** Streams the Remediation Lesson of a missed notion; events on `mastery:event`. */
  'mastery:startRemediation': { request: MasteryRemediationRequest; response: void }
  'mastery:cancel': { request: MasteryCancelRequest; response: void }
  /** Choice at the Round Limit: another angle, or skip and come back later. */
  'mastery:choose': { request: MasteryChooseRequest; response: MasteryState }
  /** The Learning Path computed from the database: steps, recommended step, progress. */
  'path:get': { request: void; response: LearningPath }
  /** Mastery per topic, Notion Map, weak points and attempt history (filtered by topic). */
  'dashboard:get': { request: DashboardRequest; response: Dashboard }
  'settings:get': { request: void; response: AppSettings }
  /** Validated, applied at once (no restart). */
  'settings:update': { request: Partial<AppSettings>; response: AppSettings }
  /** Resolves the Claude Code CLI (the given path, or the automatic lookup) and runs `--version`. */
  'settings:testCli': { request: CliCheckRequest; response: CliCheck }
  /** Topics in Learning Path order. */
  'topic:list': { request: void; response: TopicSummary[] }
  /** A topic with its Notion Outline status. */
  'topic:get': { request: TopicGetRequest; response: TopicDetail }
  /** Starts (or serves from the Content Cache) the topic's Lesson; events on `lesson:event`. */
  'lesson:start': { request: LessonStartRequest; response: void }
  'lesson:cancel': { request: LessonCancelRequest; response: void }
  /** Topics with their number of quizzes. */
  'quiz:listTopics': { request: void; response: QuizTopic[] }
  'quiz:listQuizzes': { request: { topicId: number }; response: QuizSummary[] }
  /** A quiz without its answer keys. */
  'quiz:load': { request: { quizId: number }; response: QuizView }
  /** Resumes the quiz's open Round or starts one with the topic's next round number. */
  'quiz:startRound': { request: { quizId: number }; response: RoundStart }
  /** Grades one answer in the main process and records it as an Attempt. */
  'quiz:submitAnswer': {
    request: { roundId: number } & SubmittedAnswer
    response: QuestionFeedback
  }
  /** Submits the remaining answers (optional), then grades the Round against the Mastery Threshold. */
  'quiz:completeRound': {
    request: { roundId: number; answers?: SubmittedAnswer[] }
    response: RoundResult
  }
  /** Dev only (rejected in a packaged app): creates a fixture quiz on a dev topic. */
  'quiz:createDevQuiz': { request: void; response: QuizRef }
  /** Grades a free answer through a Generation and records it as an Attempt (nothing on failure). */
  'quiz:submitFreeAnswer': {
    request: { roundId: number; questionId: number; answer: { text: string } }
    response: FreeAnswerGradingOutcome
  }
  /** Contests a free-answer grade once: re-graded with the justification. */
  'quiz:contestGrade': {
    request: { roundId: number; questionId: number; justification: string }
    response: FreeAnswerGradingOutcome
  }
  /** Cancels the free-answer grading (or contest re-grade) of a question in progress. */
  'quiz:cancelGrading': { request: { roundId: number; questionId: number }; response: void }
  /** Dev only (rejected in a packaged app): gets or creates the fixture exercise playing index n. */
  'protocol:openDevExercise': { request: ProtocolDevExerciseRequest; response: DesignExerciseRef }
  /** A Design Exercise with its Protocol Steps (active or locked), submissions, Hints, review. */
  'protocol:getExercise': { request: ProtocolExerciseRequest; response: ProtocolExerciseView }
  'protocol:saveDraft': { request: ProtocolDraftRequest; response: void }
  /** The learner read the step's Protocol Step Lesson: it is not shown again. */
  'protocol:markLessonSeen': { request: ProtocolLessonSeenRequest; response: ProtocolExerciseView }
  /** Streams (or serves from the Content Cache) a Protocol Step Lesson; events on `protocol:event`. */
  'protocol:startStepLesson': { request: ProtocolStepLessonRequest; response: void }
  /** Records a step submission and gets its Design Feedback. */
  'protocol:submitStep': {
    request: ProtocolSubmitRequest
    response: ProtocolOutcome<SubmissionView>
  }
  /** The next graded Hint on a step. */
  'protocol:requestHint': { request: ProtocolHintRequest; response: ProtocolOutcome<HintView> }
  /** Final review against the Reference Solution, once every active step was reviewed. */
  'protocol:requestFinalReview': {
    request: ProtocolFinalReviewRequest
    response: ProtocolOutcome<FinalReviewView>
  }
  /** Cancels a Protocol Step Lesson, step feedback, Hint or final review in progress. */
  'protocol:cancel': { request: ProtocolCancelRequest; response: void }
}

/** Event channel (main to renderer) to payload type. */
export interface IpcEvents {
  'generation:event': GenerationStreamEvent
  'lesson:event': LessonStreamEvent
  'mastery:event': MasteryStreamEvent
  'protocol:event': LessonStreamEvent
  /** The recomputed Learning Path, after a completed round or a Round Limit choice. */
  'path:changed': LearningPath
}

export type IpcEventChannel = keyof IpcEvents

export type IpcChannel = keyof IpcChannels
export type IpcRequest<C extends IpcChannel> = IpcChannels[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcChannels[C]['response']

/** `window.api` method name to channel. */
export const apiChannels = {
  getAppVersion: 'app:getVersion',
  getAbout: 'app:getAbout',
  ping: 'system:ping',
  startGeneration: 'generation:start',
  cancelGeneration: 'generation:cancel',
  loadDesignScene: 'design:loadScene',
  saveDesignScene: 'design:saveScene',
  openScratchDesignExercise: 'design:openScratchExercise',
  exportDesignScene: 'design:exportScene',
  listTopics: 'topic:list',
  getTopic: 'topic:get',
  startLesson: 'lesson:start',
  cancelLesson: 'lesson:cancel',
  listMasteryTopics: 'mastery:listTopics',
  getMasteryState: 'mastery:getState',
  startMasteryRound: 'mastery:startRound',
  startRemediation: 'mastery:startRemediation',
  cancelMastery: 'mastery:cancel',
  chooseAtRoundLimit: 'mastery:choose',
  getLearningPath: 'path:get',
  getDashboard: 'dashboard:get',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  testCli: 'settings:testCli',
  listQuizTopics: 'quiz:listTopics',
  listQuizzes: 'quiz:listQuizzes',
  loadQuiz: 'quiz:load',
  startRound: 'quiz:startRound',
  submitAnswer: 'quiz:submitAnswer',
  completeRound: 'quiz:completeRound',
  createDevQuiz: 'quiz:createDevQuiz',
  submitFreeAnswer: 'quiz:submitFreeAnswer',
  contestGrade: 'quiz:contestGrade',
  cancelGrading: 'quiz:cancelGrading',
  openDevProtocolExercise: 'protocol:openDevExercise',
  getProtocolExercise: 'protocol:getExercise',
  saveProtocolDraft: 'protocol:saveDraft',
  markProtocolLessonSeen: 'protocol:markLessonSeen',
  startProtocolStepLesson: 'protocol:startStepLesson',
  submitProtocolStep: 'protocol:submitStep',
  requestHint: 'protocol:requestHint',
  requestFinalReview: 'protocol:requestFinalReview',
  cancelProtocol: 'protocol:cancel'
} as const satisfies Record<string, IpcChannel>

/** `window.api` subscription method to event channel. */
export const apiEvents = {
  onGenerationEvent: 'generation:event',
  onLessonEvent: 'lesson:event',
  onMasteryEvent: 'mastery:event',
  onProtocolEvent: 'protocol:event',
  onLearningPathChanged: 'path:changed'
} as const satisfies Record<string, IpcEventChannel>

type ApiChannels = typeof apiChannels
type ApiEvents = typeof apiEvents

type ApiMethod<C extends IpcChannel> = [IpcRequest<C>] extends [void]
  ? () => Promise<IpcResponse<C>>
  : (request: IpcRequest<C>) => Promise<IpcResponse<C>>

/** Subscribes a listener and returns the function that unsubscribes it. */
type ApiSubscription<C extends IpcEventChannel> = (
  listener: (payload: IpcEvents[C]) => void
) => () => void

/** Shape of `window.api`, derived from the contract. */
export type Api = { [M in keyof ApiChannels]: ApiMethod<ApiChannels[M]> } & {
  [M in keyof ApiEvents]: ApiSubscription<ApiEvents[M]>
}

export type Invoke = (channel: IpcChannel, request?: unknown) => Promise<unknown>
export type Subscribe = (
  channel: IpcEventChannel,
  listener: (payload: unknown) => void
) => () => void

/**
 * Builds `window.api` on top of a transport (`ipcRenderer.invoke` and `ipcRenderer.on` in the
 * preload).
 */
export function createApi(invoke: Invoke, subscribe: Subscribe): Api {
  const api: Record<string, unknown> = {}
  for (const [method, channel] of Object.entries(apiChannels)) {
    api[method] = (request: unknown) => invoke(channel, request)
  }
  for (const [method, channel] of Object.entries(apiEvents)) {
    api[method] = (listener: (payload: unknown) => void) => subscribe(channel, listener)
  }
  return api as Api
}
