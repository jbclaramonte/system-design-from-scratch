// Dashboard read model. Pure: the Dashboard (overview, topics, Notion Map, weak points, attempt
// history) is aggregated from a snapshot of the database. Rules in docs/Dashboard Implementation.md.
import {
  HISTORY_ROUND_LIMIT,
  type Dashboard,
  type DashboardAttempt,
  type DashboardRound,
  type DashboardTopic,
  type HistoryRound,
  type NotionMapCell,
  type NotionMapTopic,
  type NotionTrend,
  type WeakPoint
} from '../../shared/dashboard'
import type { LearningPath, TopicStep } from '../../shared/learningPath'
import type { NotionRef, NotionScore } from '../../shared/quiz'
import { meetsThreshold } from '../quiz/grading'

/** An attempt as the Dashboard needs it. */
export interface AttemptSnapshot extends Omit<DashboardAttempt, 'notions'> {
  notionIds: readonly number[]
}

export interface RoundSnapshot {
  id: number
  number: number
  startedAt: string
  completedAt: string | null
  scorePercent: number | null
  passed: boolean | null
  /** Per-notion scores of a completed round (empty while open). */
  notionScores: readonly NotionScore[]
  /** Every attempt of the round, oldest first. */
  attempts: readonly AttemptSnapshot[]
}

export interface TopicSnapshot {
  step: TopicStep
  /** Notion Outline, in order (empty while it is not generated). */
  notions: readonly NotionRef[]
  rounds: readonly RoundSnapshot[]
}

export interface DashboardSnapshot {
  path: LearningPath
  /** The Learning Path topics, in path order. */
  topics: readonly TopicSnapshot[]
  masteryThreshold: number
  roundLimit: number
}

/** Scores closer than this (percentage points) count as the same in a trend. */
export const TREND_TOLERANCE = 5

/** Scores a trend looks at: the latest ones. */
export const TREND_WINDOW = 3

/**
 * Trend of a notion from its scores (oldest first): the latest score against the mean of the
 * previous ones in the last `TREND_WINDOW` scores. Null with fewer than two scores.
 */
export function notionTrend(scores: readonly number[]): NotionTrend | null {
  const window = scores.slice(-TREND_WINDOW)
  if (window.length < 2) return null
  const latest = window.at(-1)!
  const previous = window.slice(0, -1)
  const mean = previous.reduce((sum, score) => sum + score, 0) / previous.length
  if (latest > mean + TREND_TOLERANCE) return 'improving'
  if (latest < mean - TREND_TOLERANCE) return 'regressing'
  return 'flat'
}

const maxDate = (dates: readonly (string | null)[]): string | null =>
  dates.reduce<string | null>(
    (max, date) => (date !== null && (max === null || date > max) ? date : max),
    null
  )

const completedRounds = (topic: TopicSnapshot): RoundSnapshot[] =>
  topic.rounds.filter((round) => round.completedAt !== null).sort((a, b) => a.number - b.number)

/** Scores of a notion in the completed rounds that tested it, oldest first. */
function notionRoundScores(topic: TopicSnapshot, notionId: number): number[] {
  return completedRounds(topic).flatMap((round) =>
    round.notionScores.filter((score) => score.id === notionId).map((score) => score.scorePercent)
  )
}

function notionCell(topic: TopicSnapshot, notion: NotionRef, threshold: number): NotionMapCell {
  const scores = notionRoundScores(topic, notion.id)
  const attempts = topic.rounds.flatMap((round) =>
    round.attempts.filter((attempt) => attempt.notionIds.includes(notion.id))
  )
  const latest = scores.at(-1) ?? null
  return {
    id: notion.id,
    slug: notion.slug,
    title: notion.title,
    latestScorePercent: latest,
    scores,
    attemptCount: attempts.length,
    lastPracticedAt: maxDate(attempts.map((attempt) => attempt.attemptedAt)),
    trend: notionTrend(scores),
    mastered: latest !== null && meetsThreshold(latest, threshold)
  }
}

/** The Notion Map of a topic: one cell per notion of its Notion Outline. */
export function notionMapTopic(topic: TopicSnapshot, threshold: number): NotionMapTopic {
  return {
    topicId: topic.step.topic.id,
    slug: topic.step.topic.slug,
    title: topic.step.topic.title,
    notions: topic.notions.map((notion) => notionCell(topic, notion, threshold))
  }
}

const roundStatus = (round: RoundSnapshot): DashboardRound['status'] =>
  round.completedAt === null ? 'in_progress' : round.passed ? 'passed' : 'failed'

const toDashboardRound = (round: RoundSnapshot): DashboardRound => ({
  id: round.id,
  number: round.number,
  status: roundStatus(round),
  startedAt: round.startedAt,
  completedAt: round.completedAt,
  scorePercent: round.completedAt === null ? null : round.scorePercent,
  attemptCount: round.attempts.length
})

/** Completed rounds below the threshold since the last passed one (the Round Limit count). */
function failedRoundsSinceLastPass(completed: readonly RoundSnapshot[]): number {
  let count = 0
  for (let i = completed.length - 1; i >= 0 && completed[i]!.passed === false; i--) count++
  return count
}

function dashboardTopic(
  topic: TopicSnapshot,
  map: NotionMapTopic,
  { roundLimit }: { roundLimit: number }
): DashboardTopic {
  const completed = completedRounds(topic)
  const scores = completed.flatMap((round) =>
    round.scorePercent === null ? [] : [round.scorePercent]
  )
  return {
    step: topic.step,
    rounds: [...topic.rounds].sort((a, b) => a.number - b.number).map(toDashboardRound),
    bestScorePercent: scores.length > 0 ? Math.max(...scores) : null,
    latestScorePercent: scores.at(-1) ?? null,
    failedRounds: failedRoundsSinceLastPass(completed),
    roundLimit,
    notionsMastered: map.notions.filter((cell) => cell.mastered).length,
    notionCount: topic.notions.length,
    lastPracticedAt: maxDate(
      topic.rounds.flatMap((round) => [
        round.startedAt,
        ...round.attempts.map((attempt) => attempt.attemptedAt)
      ])
    )
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Why a notion is a weak point, in English. */
export function weakPointReason({
  roundsMissed,
  roundsTested,
  missedInLastRound,
  trend
}: {
  roundsMissed: number
  roundsTested: number
  missedInLastRound: boolean
  trend: NotionTrend | null
}): string {
  const parts = [`Missed in ${roundsMissed} of ${plural(roundsTested, 'round')}`]
  if (missedInLastRound) parts.push(roundsTested === 1 ? 'the last one' : 'including the last one')
  if (trend === 'regressing') parts.push('regressing')
  return parts.join(', ')
}

/**
 * Weak points of a topic. A notion is a weak point when it was tested in at least one completed
 * round and its latest score is below the current Mastery Threshold. A round "missed" it when
 * its score there is below the current threshold.
 */
function topicWeakPoints(
  topic: TopicSnapshot,
  map: NotionMapTopic,
  threshold: number
): WeakPoint[] {
  const completed = completedRounds(topic)
  const lastRound = completed.at(-1)
  return map.notions.flatMap((cell) => {
    if (cell.latestScorePercent === null || cell.mastered) return []
    const roundsMissed = cell.scores.filter((score) => !meetsThreshold(score, threshold)).length
    const lastScore = lastRound?.notionScores.find((score) => score.id === cell.id)
    const missedInLastRound =
      lastScore !== undefined && !meetsThreshold(lastScore.scorePercent, threshold)
    const roundsTested = cell.scores.length
    return [
      {
        notion: cell,
        topicId: topic.step.topic.id,
        topicTitle: topic.step.topic.title,
        roundsTested,
        roundsMissed,
        missedInLastRound,
        reason: weakPointReason({
          roundsMissed,
          roundsTested,
          missedInLastRound,
          trend: cell.trend
        })
      }
    ]
  })
}

/** Most urgent first: lowest latest score, then most rounds missed, then most recently practiced. */
export function compareWeakPoints(a: WeakPoint, b: WeakPoint): number {
  return (
    a.notion.latestScorePercent! - b.notion.latestScorePercent! ||
    b.roundsMissed - a.roundsMissed ||
    (b.notion.lastPracticedAt ?? '').localeCompare(a.notion.lastPracticedAt ?? '')
  )
}

function historyRounds(topics: readonly TopicSnapshot[], topicId: number | null): HistoryRound[] {
  return topics
    .filter((topic) => topicId === null || topic.step.topic.id === topicId)
    .flatMap((topic) => {
      const notions = new Map(topic.notions.map((notion) => [notion.id, notion]))
      return topic.rounds.map((round) => ({
        ...toDashboardRound(round),
        topicId: topic.step.topic.id,
        topicTitle: topic.step.topic.title,
        attempts: round.attempts.map(({ notionIds, ...attempt }) => ({
          ...attempt,
          notions: notionIds.flatMap((id) => notions.get(id) ?? [])
        }))
      }))
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id - a.id)
    .slice(0, HISTORY_ROUND_LIMIT)
}

/** The Dashboard from a database snapshot. `historyTopicId` filters the attempt history. */
export function buildDashboard(
  snapshot: DashboardSnapshot,
  { historyTopicId = null }: { historyTopicId?: number | null } = {}
): Dashboard {
  const { masteryThreshold, roundLimit } = snapshot
  const maps = snapshot.topics.map((topic) => notionMapTopic(topic, masteryThreshold))
  const rounds = snapshot.topics.flatMap((topic) => topic.rounds)
  const attempts = rounds.flatMap((round) => round.attempts)
  const { masteredTopics, totalTopics, percent } = snapshot.path.progress
  return {
    masteryThreshold,
    roundLimit,
    overview: {
      masteredTopics,
      totalTopics,
      percent,
      roundsCompleted: rounds.filter((round) => round.completedAt !== null).length,
      roundsInProgress: rounds.filter((round) => round.completedAt === null).length,
      attemptCount: attempts.length,
      accuracyPercent:
        attempts.length === 0
          ? null
          : (attempts.reduce((sum, attempt) => sum + attempt.score, 0) * 100) / attempts.length,
      lastActivityAt: maxDate(
        rounds.flatMap((round) => [
          round.startedAt,
          round.completedAt,
          ...round.attempts.map((attempt) => attempt.attemptedAt)
        ])
      )
    },
    topics: snapshot.topics.map((topic, index) =>
      dashboardTopic(topic, maps[index]!, { roundLimit })
    ),
    notionMap: maps.filter((map) => map.notions.length > 0),
    weakPoints: snapshot.topics
      .flatMap((topic, index) => topicWeakPoints(topic, maps[index]!, masteryThreshold))
      .sort(compareWeakPoints),
    history: historyRounds(snapshot.topics, historyTopicId),
    historyTopicId
  }
}
