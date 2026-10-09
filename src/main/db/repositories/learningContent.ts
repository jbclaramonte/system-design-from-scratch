import type { Database } from '../driver'
import type { Lesson, Notion, RemediationLesson, Topic } from '../types'
import { fromFlag, fromJson, TIMESTAMP_COLUMNS, toFlag, toJson } from './mapping'

// Topics

export interface NewTopic {
  slug: string
  title: string
  position: number
  inFoundationsModule?: boolean
  sourceSection?: string | null
}

interface TopicRow extends Omit<Topic, 'inFoundationsModule'> {
  inFoundationsModule: number
}

const TOPIC_COLUMNS = `id, slug, title, position, in_foundations_module AS inFoundationsModule,
  source_section AS sourceSection, ${TIMESTAMP_COLUMNS}`

const toTopic = (row: TopicRow): Topic => ({
  ...row,
  inFoundationsModule: fromFlag(row.inFoundationsModule)
})

export function createTopic(db: Database, topic: NewTopic): Topic {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO topics (slug, title, position, in_foundations_module, source_section)
       VALUES ($slug, $title, $position, $inFoundationsModule, $sourceSection)`
    )
    .run({
      slug: topic.slug,
      title: topic.title,
      position: topic.position,
      inFoundationsModule: toFlag(topic.inFoundationsModule ?? false),
      sourceSection: topic.sourceSection ?? null
    })
  return getTopic(db, lastInsertRowid)!
}

export function getTopic(db: Database, id: number): Topic | undefined {
  const row = db.prepare(`SELECT ${TOPIC_COLUMNS} FROM topics WHERE id = $id`).get<TopicRow>({ id })
  return row && toTopic(row)
}

export function getTopicBySlug(db: Database, slug: string): Topic | undefined {
  const row = db
    .prepare(`SELECT ${TOPIC_COLUMNS} FROM topics WHERE slug = $slug`)
    .get<TopicRow>({ slug })
  return row && toTopic(row)
}

/** Topics in Learning Path order. */
export function listTopics(db: Database): Topic[] {
  return db
    .prepare(`SELECT ${TOPIC_COLUMNS} FROM topics ORDER BY position, id`)
    .all<TopicRow>()
    .map(toTopic)
}

// Notions

export interface NewNotion {
  topicId: number
  slug: string
  title: string
  description?: string | null
}

const NOTION_COLUMNS = `id, topic_id AS topicId, slug, title, description, ${TIMESTAMP_COLUMNS}`

export function createNotion(db: Database, notion: NewNotion): Notion {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO notions (topic_id, slug, title, description)
       VALUES ($topicId, $slug, $title, $description)`
    )
    .run({
      topicId: notion.topicId,
      slug: notion.slug,
      title: notion.title,
      description: notion.description ?? null
    })
  return getNotion(db, lastInsertRowid)!
}

export function getNotion(db: Database, id: number): Notion | undefined {
  return db.prepare(`SELECT ${NOTION_COLUMNS} FROM notions WHERE id = $id`).get<Notion>({ id })
}

export function listNotionsByTopic(db: Database, topicId: number): Notion[] {
  return db
    .prepare(`SELECT ${NOTION_COLUMNS} FROM notions WHERE topic_id = $topicId ORDER BY id`)
    .all<Notion>({ topicId })
}

// Lessons

export interface NewLesson {
  topicId: number
  content: string
  grounded: boolean
  sourceSections?: string[]
  contentCacheKey?: string | null
}

interface LessonRow extends Omit<Lesson, 'grounded' | 'sourceSections'> {
  grounded: number
  sourceSections: string
}

const LESSON_COLUMNS = `id, topic_id AS topicId, content, grounded, source_sections AS sourceSections,
  content_cache_key AS contentCacheKey, ${TIMESTAMP_COLUMNS}`

const toLesson = (row: LessonRow): Lesson => ({
  ...row,
  grounded: fromFlag(row.grounded),
  sourceSections: fromJson<string[]>(row.sourceSections)
})

export function createLesson(db: Database, lesson: NewLesson): Lesson {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO lessons (topic_id, content, grounded, source_sections, content_cache_key)
       VALUES ($topicId, $content, $grounded, $sourceSections, $contentCacheKey)`
    )
    .run({
      topicId: lesson.topicId,
      content: lesson.content,
      grounded: toFlag(lesson.grounded),
      sourceSections: toJson(lesson.sourceSections ?? []),
      contentCacheKey: lesson.contentCacheKey ?? null
    })
  return getLesson(db, lastInsertRowid)!
}

export function getLesson(db: Database, id: number): Lesson | undefined {
  const row = db
    .prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE id = $id`)
    .get<LessonRow>({ id })
  return row && toLesson(row)
}

/** Lessons of a topic, most recent first. */
export function listLessonsByTopic(db: Database, topicId: number): Lesson[] {
  return db
    .prepare(`SELECT ${LESSON_COLUMNS} FROM lessons WHERE topic_id = $topicId ORDER BY id DESC`)
    .all<LessonRow>({ topicId })
    .map(toLesson)
}

// Remediation lessons

export interface NewRemediationLesson {
  notionId: number
  roundId?: number | null
  content: string
  grounded: boolean
  sourceSections?: string[]
  contentCacheKey?: string | null
}

interface RemediationLessonRow extends Omit<RemediationLesson, 'grounded' | 'sourceSections'> {
  grounded: number
  sourceSections: string
}

const REMEDIATION_LESSON_COLUMNS = `id, notion_id AS notionId, round_id AS roundId, content, grounded,
  source_sections AS sourceSections, content_cache_key AS contentCacheKey, ${TIMESTAMP_COLUMNS}`

const toRemediationLesson = (row: RemediationLessonRow): RemediationLesson => ({
  ...row,
  grounded: fromFlag(row.grounded),
  sourceSections: fromJson<string[]>(row.sourceSections)
})

export function createRemediationLesson(
  db: Database,
  lesson: NewRemediationLesson
): RemediationLesson {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO remediation_lessons
         (notion_id, round_id, content, grounded, source_sections, content_cache_key)
       VALUES ($notionId, $roundId, $content, $grounded, $sourceSections, $contentCacheKey)`
    )
    .run({
      notionId: lesson.notionId,
      roundId: lesson.roundId ?? null,
      content: lesson.content,
      grounded: toFlag(lesson.grounded),
      sourceSections: toJson(lesson.sourceSections ?? []),
      contentCacheKey: lesson.contentCacheKey ?? null
    })
  return getRemediationLesson(db, lastInsertRowid)!
}

export function getRemediationLesson(db: Database, id: number): RemediationLesson | undefined {
  const row = db
    .prepare(`SELECT ${REMEDIATION_LESSON_COLUMNS} FROM remediation_lessons WHERE id = $id`)
    .get<RemediationLessonRow>({ id })
  return row && toRemediationLesson(row)
}

/** Remediation lessons on a notion, most recent first. */
export function listRemediationLessonsByNotion(
  db: Database,
  notionId: number
): RemediationLesson[] {
  return db
    .prepare(
      `SELECT ${REMEDIATION_LESSON_COLUMNS} FROM remediation_lessons
       WHERE notion_id = $notionId ORDER BY id DESC`
    )
    .all<RemediationLessonRow>({ notionId })
    .map(toRemediationLesson)
}
