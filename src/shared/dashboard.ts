/**
 * Dashboard types shared by the main process (src/main/dashboard) and the Dashboard screen
 * (src/renderer/src/dashboard). The Dashboard is a read model: computed from the database
 * (topics, rounds, attempts, settings) every time, never stored. Rules in
 * docs/Dashboard Implementation.md.
 */
import type { TopicStep } from './learningPath'
import type { NotionRef, QuestionType, AttemptResult } from './quiz'

/**
 * Trend of a notion over its last three scores (completed rounds that tested it): the latest
 * score against the mean of the previous ones in that window. Null with fewer than two scores.
 */
export const notionTrends = ['improving', 'flat', 'regressing'] as const
export type NotionTrend = (typeof notionTrends)[number]

/** Status of a round in the Dashboard: an open round is in progress, never a failure. */
export type DashboardRoundStatus = 'passed' | 'failed' | 'in_progress'

export interface DashboardRound {
  id: number
  /** Unique per topic, never restarts. */
  number: number
  status: DashboardRoundStatus
  startedAt: string
  completedAt: string | null
  /** 0 to 100, null while in progress. */
  scorePercent: number | null
  /** Attempts recorded in the round (an open round may have some). */
  attemptCount: number
}

/** One topic of the Learning Path, with its rounds and its notions mastered. */
export interface DashboardTopic {
  /** The topic's Learning Path step: its mastery, its lock and what locks it. */
  step: TopicStep
  /** Rounds in number order. */
  rounds: DashboardRound[]
  /** Best and latest completed round scores, 0 to 100; null without a completed round. */
  bestScorePercent: number | null
  latestScorePercent: number | null
  /** Completed rounds below the threshold since the last passed one (the Round Limit count). */
  failedRounds: number
  roundLimit: number
  /** Notions whose latest score meets the current Mastery Threshold. */
  notionsMastered: number
  /** Notions of the Notion Outline (0 while it is not generated). */
  notionCount: number
  /** Latest attempt or round start; null when never practiced. */
  lastPracticedAt: string | null
}

/** One cell of the Notion Map. */
export interface NotionMapCell extends NotionRef {
  /** Score in the most recent completed round that tested it, 0 to 100; null when untested. */
  latestScorePercent: number | null
  /** Scores of the completed rounds that tested it, oldest first. */
  scores: number[]
  /** Attempts on questions tagged with the notion (open rounds included). */
  attemptCount: number
  lastPracticedAt: string | null
  trend: NotionTrend | null
  /** Latest score meets the current Mastery Threshold. */
  mastered: boolean
}

/** The Notion Map of a topic that has a Notion Outline. */
export interface NotionMapTopic {
  topicId: number
  slug: string
  title: string
  /** In Notion Outline order. */
  notions: NotionMapCell[]
}

/** A notion to practice, with why (see the weak-point rule in docs/Dashboard Implementation.md). */
export interface WeakPoint {
  notion: NotionMapCell
  topicId: number
  topicTitle: string
  /** Completed rounds that tested the notion, and those where it scored below the threshold. */
  roundsTested: number
  roundsMissed: number
  /** Missed in the latest completed round of its topic. */
  missedInLastRound: boolean
  /** English, for example "Missed in 3 of 3 rounds, including the last one". */
  reason: string
}

export interface DashboardAttempt {
  id: number
  questionId: number
  /** French. */
  prompt: string
  questionType: QuestionType
  result: AttemptResult
  /** 0 to 1. */
  score: number
  notions: NotionRef[]
  attemptedAt: string
  /** Free answers: the grade was contested and re-graded (the result shown is the new one). */
  contested: boolean
}

/** A round in the attempt history, with its attempts. */
export interface HistoryRound extends DashboardRound {
  topicId: number
  topicTitle: string
  attempts: DashboardAttempt[]
}

export interface DashboardOverview {
  /** From the Learning Path progress. */
  masteredTopics: number
  totalTopics: number
  percent: number
  roundsCompleted: number
  roundsInProgress: number
  attemptCount: number
  /** Sum of attempt scores over attempts, 0 to 100; null without attempts. */
  accuracyPercent: number | null
  /** Latest attempt, round start or completion; null on a fresh install. */
  lastActivityAt: string | null
}

export interface Dashboard {
  /** The current setting: notion mastery and weak points use it, past rounds keep theirs. */
  masteryThreshold: number
  roundLimit: number
  overview: DashboardOverview
  /** Learning Path topics, in path order. */
  topics: DashboardTopic[]
  /** Topics with a Notion Outline, in path order. */
  notionMap: NotionMapTopic[]
  /** Sorted, most urgent first. */
  weakPoints: WeakPoint[]
  /** Most recent rounds first (at most `HISTORY_ROUND_LIMIT`), filtered by `topicId` if set. */
  history: HistoryRound[]
  /** The topic filter applied to `history`, null for all topics. */
  historyTopicId: number | null
}

/** Rounds kept in the attempt history. */
export const HISTORY_ROUND_LIMIT = 50

export interface DashboardRequest {
  /** Restricts the attempt history to one topic. */
  topicId?: number
}
