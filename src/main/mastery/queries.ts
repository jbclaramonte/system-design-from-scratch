// Mastery queries: load the Mastery Loop snapshot of a topic from the database, and the read
// models reused by the Notion Map (#17) and the Dashboard (#18).
import { listTopicSummaries } from '../content/topics'
import type { Database } from '../db'
import {
  listAttemptsByRound,
  listQuestions,
  listRoundsByTopic
} from '../db/repositories/assessment'
import {
  listLessonsByTopic,
  listNotionsByTopic,
  listRemediationLessonsByTopic
} from '../db/repositories/learningContent'
import { listRoundLimitChoicesByTopic } from '../db/repositories/mastery'
import { getSettings } from '../db/repositories/settings'
import type { Round } from '../db/types'
import { notionScores } from '../quiz/grading'
import type { NotionLatestScore, TopicMastery, TopicMasterySummary } from '../../shared/mastery'
import type { NotionRef, NotionScore } from '../../shared/quiz'
import { deriveMastery, type MasterySnapshot } from './state'

const notionRefs = (db: Database, topicId: number): NotionRef[] =>
  listNotionsByTopic(db, topicId).map(({ id, slug, title }) => ({ id, slug, title }))

/**
 * Per-notion scores of a round, from its attempts on the questions in play (the same ones the
 * quiz service scores). Empty for a round without attempts.
 */
export function roundNotionScores(
  db: Database,
  round: Round,
  notions: readonly NotionRef[] = notionRefs(db, round.topicId)
): NotionScore[] {
  const inPlay = new Set(listQuestions(db, round.quizId).map((question) => question.id))
  const attempts = listAttemptsByRound(db, round.id).filter((a) => inPlay.has(a.questionId))
  return notionScores(attempts, notions)
}

/** Everything the state machine needs about a topic, read from the database. */
export function loadMasterySnapshot(db: Database, topicId: number): MasterySnapshot {
  const notions = notionRefs(db, topicId)
  const { masteryThreshold, roundLimit } = getSettings(db)
  return {
    lessonReady: listLessonsByTopic(db, topicId).length > 0,
    rounds: listRoundsByTopic(db, topicId).map((round) => ({
      id: round.id,
      quizId: round.quizId,
      number: round.number,
      completed: round.completedAt !== null,
      passed: round.passed,
      notionScores: round.completedAt !== null ? roundNotionScores(db, round, notions) : []
    })),
    remediations: listRemediationLessonsByTopic(db, topicId).flatMap(({ roundId, notionId }) =>
      roundId === null ? [] : [{ roundId, notionId }]
    ),
    choices: listRoundLimitChoicesByTopic(db, topicId).map(({ roundId, choice }) => ({
      roundId,
      choice
    })),
    masteryThreshold,
    roundLimit
  }
}

/**
 * Mastery of a topic: not_started, in_progress, mastered, limit_reached or skipped. The one
 * derivation (`deriveMastery`) behind the topic header, the Learning Path, the Dashboard and the
 * recommended step: a topic is `in_progress` once a Lesson is recorded or a Round was opened.
 */
export function getTopicMastery(db: Database, topicId: number): TopicMastery {
  return deriveMastery(loadMasterySnapshot(db, topicId)).status
}

/** Topics in Learning Path order, with their mastery. */
export function listTopicMasteries(db: Database): TopicMasterySummary[] {
  return listTopicSummaries(db).map((topic) => ({
    ...topic,
    mastery: getTopicMastery(db, topic.id)
  }))
}

/**
 * Latest score of each notion of a topic: from the most recent completed round that has a
 * question on it. Notions never tested are left out. In Notion Outline order.
 */
export function latestNotionScores(db: Database, topicId: number): NotionLatestScore[] {
  const notions = notionRefs(db, topicId)
  const completed = listRoundsByTopic(db, topicId)
    .filter((round) => round.completedAt !== null)
    .sort((a, b) => b.number - a.number)
  const latest = new Map<number, NotionLatestScore>()
  for (const round of completed) {
    for (const score of roundNotionScores(db, round, notions)) {
      if (latest.has(score.id)) continue
      latest.set(score.id, {
        id: score.id,
        slug: score.slug,
        title: score.title,
        roundId: round.id,
        roundNumber: round.number,
        questionCount: score.questionCount,
        scorePercent: score.scorePercent
      })
    }
  }
  return notions.flatMap((notion) => latest.get(notion.id) ?? [])
}
