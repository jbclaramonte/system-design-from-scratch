// Lesson review: the recorded Lesson and Remediation Lessons of a topic, for the reading panel of
// the topic screen. Read-only on the database: no Generation, no Content Cache access, nothing
// recorded (reading counts as nothing for mastery).
import { lessonSources } from '../content/lessonIpc'
import { toNotionRef } from '../content/topics'
import type { Corpus } from '../corpus'
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
 */
export function getLessonReview(db: Database, corpus: Corpus, topicId: number): LessonReview {
  if (!getTopic(db, topicId)) throw new Error(`Topic ${topicId} does not exist.`)
  const notions = new Map(listNotionsByTopic(db, topicId).map((notion) => [notion.id, notion]))
  const roundNumbers = new Map(listRoundsByTopic(db, topicId).map((r) => [r.id, r.number]))
  // Oldest first: the rank among the lessons of a notion gives its angle.
  const ranks = new Map<number, number>()
  const remediationLessons = listRemediationLessonsByTopic(db, topicId).flatMap(
    (lesson): ReviewedRemediationLesson[] => {
      const notion = notions.get(lesson.notionId)
      const rank = ranks.get(lesson.notionId) ?? 0
      ranks.set(lesson.notionId, rank + 1)
      if (!notion) return []
      return [
        {
          ...toReviewed(corpus, lesson),
          notion: toNotionRef(notion),
          angle: remediationAngle(rank),
          roundNumber: lesson.roundId === null ? null : (roundNumbers.get(lesson.roundId) ?? null)
        }
      ]
    }
  )
  remediationLessons.sort((a, b) => (b.roundNumber ?? -1) - (a.roundNumber ?? -1) || a.id - b.id)
  const lesson = listLessonsByTopic(db, topicId)[0]
  return {
    topicId,
    lesson: lesson ? toReviewed(corpus, lesson) : null,
    remediationLessons
  }
}
