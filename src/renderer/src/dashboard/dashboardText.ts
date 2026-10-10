import type {
  DashboardRoundStatus,
  DashboardTopic,
  NotionMapCell,
  NotionTrend
} from '../../../shared/dashboard'
import type { LearningPathStepStatus, TopicStep } from '../../../shared/learningPath'
import type { AttemptResult, QuestionType } from '../../../shared/quiz'
import { lockMessage } from '../path/pathText'
import { resultLabels as feedbackLabels } from '../quiz/feedbackText'
import { formatPercent } from '../quiz/progress'

export const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  scenario: 'Scenario',
  free_answer: 'Free answer'
}

/** Result labels, with a symbol so the result never relies on colour alone. */
export const resultLabels: Record<AttemptResult, string> = {
  correct: `✓ ${feedbackLabels.correct}`,
  partially_correct: `◐ ${feedbackLabels.partially_correct}`,
  incorrect: `✗ ${feedbackLabels.incorrect}`
}

export const roundStatusLabels: Record<DashboardRoundStatus, string> = {
  passed: '✓ Passed',
  failed: '✗ Below threshold',
  in_progress: '… In progress'
}

export const trendLabels: Record<NotionTrend, string> = {
  improving: '↑ Improving',
  flat: '→ Flat',
  regressing: '↓ Regressing'
}

export const trendLabel = (trend: NotionTrend | null): string =>
  trend === null ? 'Not enough rounds for a trend' : trendLabels[trend]

export const percentOrDash = (value: number | null): string =>
  value === null ? '–' : formatPercent(Math.round(value * 10) / 10)

/**
 * Heat level of a Notion Map cell, against the current Mastery Threshold: `untested`, `low`
 * (below 50%), `partial` (50% or more, below the threshold) or `mastered` (threshold met).
 */
export type HeatLevel = 'untested' | 'low' | 'partial' | 'mastered'

export function heatLevel(cell: NotionMapCell): HeatLevel {
  if (cell.latestScorePercent === null) return 'untested'
  if (cell.mastered) return 'mastered'
  return cell.latestScorePercent < 50 ? 'low' : 'partial'
}

/** Symbol shown in a cell next to its score, so the level never relies on colour alone. */
export const heatSymbols: Record<HeatLevel, string> = {
  untested: '○',
  low: '✗',
  partial: '◐',
  mastered: '✓'
}

/** Legend of the Notion Map; no `partial` level when the threshold is 50%. */
export function heatLegend(threshold: number): { level: HeatLevel; label: string }[] {
  const legend: { level: HeatLevel; label: string }[] = [
    { level: 'mastered', label: `Mastered (${threshold}% or more)` },
    { level: 'partial', label: `50% to below ${threshold}%` },
    { level: 'low', label: 'Below 50%' },
    { level: 'untested', label: 'Not tested yet' }
  ]
  return legend.filter(({ level }) => level !== 'partial' || threshold > 50)
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** "5 minutes ago", "3 days ago"... from an ISO date. */
export function timeSince(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return 'Never'
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${plural(hours, 'hour')} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${plural(days, 'day')} ago`
  return `on ${new Date(iso).toLocaleDateString()}`
}

/** Full description of a cell, its accessible name. */
export function cellDescription(cell: NotionMapCell, now?: Date): string {
  if (cell.latestScorePercent === null) {
    return `${cell.title}: not tested yet${cell.attemptCount > 0 ? `, ${plural(cell.attemptCount, 'attempt')} in an open round` : ''}.`
  }
  return [
    `${cell.title}: latest score ${percentOrDash(cell.latestScorePercent)}`,
    cell.mastered ? 'mastered' : 'not mastered',
    cell.trend === null ? 'no trend yet' : `trend ${cell.trend}`,
    plural(cell.attemptCount, 'attempt'),
    `last practiced ${timeSince(cell.lastPracticedAt, now).toLowerCase()}`
  ].join(', ')
}

/** Notions mastered over the Notion Outline, 0 to 100 (0 without outline). */
export const notionProgress = (topic: DashboardTopic): number =>
  topic.notionCount === 0 ? 0 : Math.floor((topic.notionsMastered * 100) / topic.notionCount)

/** "2 of 3 rounds before the Round Limit", "Round Limit reached"... */
export const roundLimitReached = (topic: DashboardTopic): boolean =>
  topic.step.topic.mastery !== 'mastered' && topic.failedRounds >= topic.roundLimit

export function roundLimitText(topic: DashboardTopic): string {
  if (topic.step.topic.mastery === 'mastered') return 'Mastered'
  if (roundLimitReached(topic)) return 'Round Limit reached'
  return `${topic.failedRounds} of ${topic.roundLimit} failed rounds`
}

/** Whether "Practice" can open the topic, and why not when it is locked. */
export function practiceState(
  step: TopicStep
): { enabled: true } | { enabled: false; reason: string } {
  if (step.status !== 'locked') return { enabled: true }
  return { enabled: false, reason: lockMessage(step) ?? 'Locked on the Learning Path.' }
}

/** A Dashboard is empty until the first round is started. */
export const isEmptyDashboard = ({
  overview
}: {
  overview: { roundsCompleted: number; roundsInProgress: number; attemptCount: number }
}): boolean =>
  overview.roundsCompleted === 0 && overview.roundsInProgress === 0 && overview.attemptCount === 0

/**
 * Shared chip classes (`chip-*` of the Design System) for a status. The label text always stays
 * next to the chip, so a status never relies on colour alone.
 */
export const stepStatusChip = (status: LearningPathStepStatus): string => {
  switch (status) {
    case 'mastered':
    case 'completed':
      return 'chip chip-mastered chip-dot'
    case 'in_progress':
      return 'chip chip-progress chip-dot'
    case 'skipped':
      return 'chip chip-attention chip-dot'
    case 'limit_reached':
      return 'chip chip-error chip-dot'
    case 'locked':
    case 'coming_soon':
      return 'chip chip-locked chip-dot'
    case 'available':
      return 'chip'
  }
}

export const roundStatusChip = (status: DashboardRoundStatus): string => {
  switch (status) {
    case 'passed':
      return 'chip chip-mastered chip-dot'
    case 'failed':
      return 'chip chip-attention chip-dot'
    case 'in_progress':
      return 'chip chip-progress chip-dot'
  }
}

export const resultChip = (result: AttemptResult): string => {
  switch (result) {
    case 'correct':
      return 'chip chip-mastered chip-dot'
    case 'partially_correct':
      return 'chip chip-attention chip-dot'
    case 'incorrect':
      return 'chip chip-error chip-dot'
  }
}

/** Chip of a weak point's latest score: red below 50%, amber above (the two low heat levels). */
export const weakScoreChip = (latestScorePercent: number | null): string =>
  latestScorePercent !== null && latestScorePercent >= 50
    ? 'chip chip-attention chip-dot'
    : 'chip chip-error chip-dot'
