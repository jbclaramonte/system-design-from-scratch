/**
 * Mastery Loop types shared by the main process (src/main/mastery) and the topic screen
 * (src/renderer/src/mastery). The loop state is derived from the database, so it survives
 * restarts: an open round is resumed, a remediation step shows the lessons already generated.
 */
import type { LessonEvent } from './lesson'
import type { NotionRef, RoundStart, RoundView } from './quiz'
import type { TopicSummary } from './topic'

/** Mastery of a topic, for the topic list, the Notion Map (#17) and the Dashboard (#18). */
export const topicMasteries = [
  'not_started',
  'in_progress',
  'mastered',
  'limit_reached',
  'skipped'
] as const
export type TopicMastery = (typeof topicMasteries)[number]

/**
 * The angle of a Remediation Lesson. The original lesson is a step-by-step explanation; each new
 * Remediation Lesson on a notion takes the next angle not used yet for that notion.
 */
export const remediationAngles = [
  'concrete_example',
  'analogy',
  'contrast',
  'guided_questions'
] as const
export type RemediationAngle = (typeof remediationAngles)[number]

/** What the learner picks when the Round Limit is reached. */
export const roundLimitChoices = ['another_angle', 'skip'] as const
export type RoundLimitChoice = (typeof roundLimitChoices)[number]

/** A missed notion of a failed round, with its Remediation Lesson. */
export interface RemediationTarget {
  notion: NotionRef
  /** Score of the notion in the failed round, 0 to 100. */
  scorePercent: number
  angle: RemediationAngle
  /** Angles of earlier Remediation Lessons on this notion, oldest first. */
  usedAngles: RemediationAngle[]
  /** Its Remediation Lesson was generated and recorded for this round. */
  ready: boolean
}

/**
 * Where the learner is in the loop:
 * - `lesson`: no round yet; the quiz starts once the lesson exists.
 * - `round`: a round is open (started, not completed): it is resumed, never restarted.
 * - `remediation`: the latest round failed; one Remediation Lesson per missed notion, then the
 *   next round. `anotherAngle` when chosen at the Round Limit.
 * - `limit_reached`: the Round Limit is reached; the learner picks another angle or a skip.
 * - `skipped`: the learner skipped the topic to come back later.
 * - `mastered`: the latest round met the Mastery Threshold.
 */
export type MasteryStep =
  | { name: 'lesson'; lessonReady: boolean }
  | { name: 'round'; roundId: number; quizId: number }
  | { name: 'remediation'; roundId: number; anotherAngle: boolean; targets: RemediationTarget[] }
  | { name: 'limit_reached'; roundId: number }
  | { name: 'skipped'; roundId: number }
  | { name: 'mastered'; roundId: number }

export interface MasteryState {
  topicId: number
  topicTitle: string
  status: TopicMastery
  step: MasteryStep
  /** Number of the round being played, or of the next one (unique per topic, never restarts). */
  roundNumber: number
  /** Completed rounds below the Mastery Threshold since the last passed round. */
  failedRounds: number
  masteryThreshold: number
  roundLimit: number
  /** The latest completed round, if any. */
  lastRound: RoundView | null
}

/** A topic of the Learning Path with its mastery. */
export interface TopicMasterySummary extends TopicSummary {
  mastery: TopicMastery
}

/** Latest score of a notion: the most recent completed round that tested it. */
export interface NotionLatestScore extends NotionRef {
  roundId: number
  roundNumber: number
  questionCount: number
  /** 0 to 100. */
  scorePercent: number
}

export interface MasteryTopicRequest {
  topicId: number
}

export interface MasteryStartRoundRequest {
  /** Chosen by the renderer (`crypto.randomUUID()`), tags every event of the request. */
  requestId: string
  topicId: number
}

export interface MasteryRemediationRequest {
  requestId: string
  topicId: number
  notionId: number
}

export interface MasteryCancelRequest {
  requestId: string
}

export interface MasteryChooseRequest {
  topicId: number
  choice: RoundLimitChoice
}

/**
 * Events of a mastery request. A remediation request sends the events of a lesson request
 * (`prepared`, then the Generation events). A round request sends `queued`, `started`, `retry`
 * or `error` while the quiz is prepared (never the quiz itself: it holds the answer keys), then
 * `round_ready` with the round to play.
 */
export type MasteryEvent = LessonEvent | { type: 'round_ready'; start: RoundStart }

export interface MasteryStreamEvent {
  requestId: string
  event: MasteryEvent
}
