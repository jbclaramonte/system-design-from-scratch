// Lesson review: the recorded Lesson and Remediation Lessons of a topic, for the reading panel of
// the topic screen. Read-only on the database: no Generation, no Content Cache access, nothing
// recorded (reading counts as nothing for mastery).
import { lessonSources } from '../content/lessonIpc'
import { toNotionRef } from '../content/topics'
import type { Corpus } from '../corpus'
import type { GenerationLanguage } from '../../shared/generationLanguage'
import type { Database } from '../db'
import { listRoundsByTopic } from '../db/repositories/assessment'
import {
  getTopic,
  listLessonsByTopic,
  listNotionsByTopic,
  listRemediationLessonsByTopic
} from '../db/repositories/learningContent'
import type { Lesson, RemediationLesson } from '../db/types'
import type { LessonReview, ReviewedLesson, ReviewedRemediationLesson } from '../../shared/mastery'
import { remediationAngle } from './state'

const toReviewed = (corpus: Corpus, lesson: Lesson | RemediationLesson): ReviewedLesson => ({
  id: lesson.id,
  markdown: lesson.content,
  grounded: lesson.grounded,
  sources: lessonSources(corpus, lesson.sourceSections),
  recordedAt: lesson.createdAt
})

/**
 * The topic's latest Lesson and every Remediation Lesson recorded on its notions, the newest
 * round first (a lesson of an unknown round last; within a round, in recording order). The angle
 * of a Remediation Lesson is its rank among the lessons on the same notion, as the loop assigns
 * them.
 *
 * Content comes in the Generation Language when it exists in it, else in the other one (a
 * lesson read in French stays readable after switching to English): the Lesson is the latest of
 * the language, a Remediation Lesson is the one of that language for its round and notion.
 */
export function getLessonReview(
  db: Database,
  corpus: Corpus,
  topicId: number,
  language: GenerationLanguage
): LessonReview {
  if (!getTopic(db, topicId)) throw new Error(`Topic ${topicId} does not exist.`)
  const notions = new Map(listNotionsByTopic(db, topicId).map((notion) => [notion.id, notion]))
  const roundNumbers = new Map(listRoundsByTopic(db, topicId).map((r) => [r.id, r.number]))
  const recorded = listRemediationLessonsByTopic(db, topicId)
  // One entry per round and notion (a lesson of an unknown round stands alone), the one in the
  // Generation Language when there are both.
  const keyOf = (lesson: RemediationLesson) =>
    lesson.roundId === null ? `lesson:${lesson.id}` : `${lesson.roundId}:${lesson.notionId}`
  const chosen = new Map<string, RemediationLesson>()
  for (const lesson of recorded) {
    const current = chosen.get(keyOf(lesson))
    if (!current || (current.language !== language && lesson.language === language)) {
      chosen.set(keyOf(lesson), lesson)
    }
  }
  // Oldest first: the rank among the entries of a notion gives its angle, as the loop assigns
  // them (the same round and notion read in both languages is one angle).
  const ranks = new Map<number, number>()
  const rankOf = new Map<string, number>()
  for (const lesson of recorded) {
    const key = keyOf(lesson)
    if (rankOf.has(key)) continue
    const rank = ranks.get(lesson.notionId) ?? 0
    ranks.set(lesson.notionId, rank + 1)
    rankOf.set(key, rank)
  }
  const remediationLessons = [...chosen.values()].flatMap((lesson): ReviewedRemediationLesson[] => {
    const notion = notions.get(lesson.notionId)
    if (!notion) return []
    return [
      {
        ...toReviewed(corpus, lesson),
        notion: toNotionRef(notion),
        angle: remediationAngle(rankOf.get(keyOf(lesson))!),
        roundNumber: lesson.roundId === null ? null : (roundNumbers.get(lesson.roundId) ?? null)
      }
    ]
  })
  remediationLessons.sort((a, b) => (b.roundNumber ?? -1) - (a.roundNumber ?? -1) || a.id - b.id)
  const lessons = listLessonsByTopic(db, topicId)
  const lesson = lessons.find((l) => l.language === language) ?? lessons[0]
  return {
    topicId,
    lesson: lesson ? toReviewed(corpus, lesson) : null,
    remediationLessons
  }
}
