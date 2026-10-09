// Topic bootstrap: seeds the `topics` table from the Source Corpus at startup, and the Topic
// read models sent to the renderer.
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import {
  createTopic,
  getTopic,
  listNotionsByTopic,
  listTopics
} from '../db/repositories/learningContent'
import type { Notion, Topic } from '../db/types'
import type { NotionRef, TopicDetail, TopicSummary } from '../../shared/topic'

/** A Foundations Module topic: outside the primer, so not in the corpus. */
export interface FoundationsTopicSeed {
  slug: string
  title: string
}

/**
 * Foundations Module topics come first in the Learning Path; primer topics start at this
 * position, so foundations can be added later without moving them.
 */
export const CORPUS_TOPIC_POSITION_OFFSET = 1000

/**
 * Primer sections that are not teachable Topics: orientation, interview method and question
 * lists, appendix. They have no Notion Outline worth testing, so they are neither seeded nor
 * listed. (The interview method feeds the Interview Protocol instead.)
 */
export const NON_TEACHABLE_CORPUS_TOPIC_IDS: readonly string[] = [
  'motivation',
  'study-guide',
  'how-to-approach-a-system-design-interview-question',
  'system-design-interview-questions-with-solutions',
  'object-oriented-design-interview-questions-with-solutions',
  'system-design-topics-start-here',
  'appendix'
]

/**
 * Inserts the topics that are missing: one per corpus topic (slug = corpus topic id, title from
 * the primer heading, corpus order), plus the given Foundations Module topics. Idempotent:
 * existing topics are left as they are (their ids are referenced by notions and attempts).
 * Returns the number of topics created.
 */
export function seedTopics(
  db: Database,
  corpus: Corpus,
  foundations: readonly FoundationsTopicSeed[] = [],
  excludedCorpusTopicIds: readonly string[] = NON_TEACHABLE_CORPUS_TOPIC_IDS
): number {
  const corpusTopics = corpus
    .listTopics()
    .filter((topic) => !excludedCorpusTopicIds.includes(topic.id))
  const corpusIds = new Set(corpusTopics.map((topic) => topic.id))
  for (const seed of foundations) {
    if (corpusIds.has(seed.slug)) {
      throw new Error(`Foundations Module topic "${seed.slug}" clashes with a primer topic.`)
    }
  }
  return db.transaction(() => {
    const existing = new Set(listTopics(db).map((topic) => topic.slug))
    let created = 0
    foundations.forEach((seed, index) => {
      if (existing.has(seed.slug)) return
      createTopic(db, { ...seed, position: index, inFoundationsModule: true })
      created++
    })
    corpusTopics.forEach((topic, index) => {
      if (existing.has(topic.id)) return
      createTopic(db, {
        slug: topic.id,
        title: topic.title,
        position: CORPUS_TOPIC_POSITION_OFFSET + index,
        sourceSection: topic.id
      })
      created++
    })
    return created
  })
}

export const toNotionRef = ({ id, slug, title, description }: Notion): NotionRef => ({
  id,
  slug,
  title,
  description
})

function toSummary(topic: Topic, notionCount: number): TopicSummary {
  return {
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    position: topic.position,
    inFoundationsModule: topic.inFoundationsModule,
    notionCount
  }
}

/** Topics in Learning Path order. */
export function listTopicSummaries(db: Database): TopicSummary[] {
  return listTopics(db)
    .filter((topic) => !NON_TEACHABLE_CORPUS_TOPIC_IDS.includes(topic.slug))
    .map((topic) => toSummary(topic, listNotionsByTopic(db, topic.id).length))
}

/** A topic with its Notion Outline, or `undefined` if it does not exist. */
export function getTopicDetail(db: Database, topicId: number): TopicDetail | undefined {
  const topic = getTopic(db, topicId)
  if (!topic) return undefined
  const notions = listNotionsByTopic(db, topicId)
  return {
    ...toSummary(topic, notions.length),
    notionOutline:
      notions.length > 0
        ? { status: 'ready', notions: notions.map(toNotionRef) }
        : { status: 'missing' }
  }
}
