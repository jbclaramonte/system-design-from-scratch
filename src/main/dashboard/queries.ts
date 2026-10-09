// Dashboard queries: the snapshot `buildDashboard` aggregates, read from the database (the
// Learning Path, the rounds and attempts of each topic, the settings). Read only.
import type { Database } from '../db'
import {
  listAttemptsByRound,
  listQuestionHistory,
  listRoundsByTopic
} from '../db/repositories/assessment'
import { listNotionsByTopic } from '../db/repositories/learningContent'
import { getSettings } from '../db/repositories/settings'
import type { Attempt } from '../db/types'
import { roundNotionScores } from '../mastery/queries'
import { getLearningPath, type LearningPathDeps } from '../path/pathIpc'
import { parseGradingRecord } from '../quiz/grading'
import type { TopicStep } from '../../shared/learningPath'
import type { AttemptSnapshot, DashboardSnapshot, TopicSnapshot } from './model'

/** A free answer whose grade was contested (and re-graded). False when unreadable. */
function isContested(attempt: Attempt): boolean {
  if (attempt.questionType !== 'free_answer') return false
  try {
    return parseGradingRecord(attempt.feedback).contest !== null
  } catch {
    return false
  }
}

function topicSnapshot(db: Database, step: TopicStep): TopicSnapshot {
  const notions = listNotionsByTopic(db, step.topic.id).map(({ id, slug, title }) => ({
    id,
    slug,
    title
  }))
  const rounds = listRoundsByTopic(db, step.topic.id).map((round) => {
    // Replaced questions included: their attempts are history too.
    const prompts = new Map(
      listQuestionHistory(db, round.quizId).map((question) => [question.id, question.prompt])
    )
    const attempts: AttemptSnapshot[] = listAttemptsByRound(db, round.id).map((attempt) => ({
      id: attempt.id,
      questionId: attempt.questionId,
      prompt: prompts.get(attempt.questionId) ?? '',
      questionType: attempt.questionType,
      result: attempt.result,
      score: attempt.score,
      notionIds: attempt.notionIds,
      attemptedAt: attempt.attemptedAt,
      contested: isContested(attempt)
    }))
    return {
      id: round.id,
      number: round.number,
      startedAt: round.startedAt,
      completedAt: round.completedAt,
      scorePercent: round.scorePercent,
      passed: round.passed,
      notionScores: round.completedAt !== null ? roundNotionScores(db, round, notions) : [],
      attempts
    }
  })
  return { step, notions, rounds }
}

/** Everything the Dashboard shows, read from the database. */
export function loadDashboardSnapshot(deps: LearningPathDeps): DashboardSnapshot {
  const path = getLearningPath(deps)
  const { masteryThreshold, roundLimit } = getSettings(deps.db)
  return {
    path,
    topics: path.steps
      .filter((step): step is TopicStep => step.kind === 'topic')
      .map((step) => topicSnapshot(deps.db, step)),
    masteryThreshold,
    roundLimit
  }
}
