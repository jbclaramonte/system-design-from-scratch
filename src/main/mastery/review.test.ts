import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { createQuiz, createRound, completeRound } from '../db/repositories/assessment'
import {
  createLesson,
  createNotions,
  createRemediationLesson,
  createTopic
} from '../db/repositories/learningContent'
import type { Notion, Round, Topic } from '../db/types'
import type { CliRunner } from '../generation/service'
import { GenerationService } from '../generation/service'
import { cacheOutline, fixtureCorpus } from '../generation/testing/contentFixtures'
import { createTopicLockGuard } from '../path/lock'
import { createQuizService } from '../quiz/service'
import { createMasteryIpc } from './masteryIpc'
import { getLessonReview } from './review'
import { createMasteryService } from './service'

const corpus = fixtureCorpus()

let db: Database
let topic: Topic
let notions: Notion[]
let runner: ReturnType<typeof vi.fn<CliRunner>>
let generation: GenerationService

const notion = (slug: string) => notions.find((n) => n.slug === slug)!

function failedRound(number: number): Round {
  const quiz = createQuiz(db, { topicId: topic.id, grounded: true, questions: [] })
  const round = createRound(db, { topicId: topic.id, quizId: quiz.id, number })
  return completeRound(db, round.id, { scorePercent: 50, passed: false })
}

const remediation = (slug: string, roundId: number | null, content: string) =>
  createRemediationLesson(db, {
    notionId: notion(slug).id,
    roundId,
    content,
    grounded: true,
    sourceSections: ['cache']
  })

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1, sourceSection: 'cache' })
  notions = createNotions(
    db,
    cacheOutline.notions.map((n) => ({ topicId: topic.id, ...n }))
  )
  runner = vi.fn<CliRunner>().mockRejectedValue(new Error('the CLI must not be called'))
  generation = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
})

afterEach(() => {
  generation.dispose()
  db.close()
})

describe('getLessonReview', () => {
  it('has nothing to review before the first Lesson', () => {
    expect(getLessonReview(db, corpus, topic.id)).toEqual({
      topicId: topic.id,
      lesson: null,
      remediationLessons: []
    })
  })

  it('returns the latest recorded Lesson with its source chips', () => {
    createLesson(db, { topicId: topic.id, content: 'Old', grounded: true })
    const latest = createLesson(db, {
      topicId: topic.id,
      content: '# Le cache',
      grounded: true,
      sourceSections: ['cache', 'unknown-section']
    })

    const { lesson } = getLessonReview(db, corpus, topic.id)

    expect(lesson).toMatchObject({ id: latest.id, markdown: '# Le cache', grounded: true })
    // A section that is not in the corpus is dropped, like in the lesson screen.
    expect(lesson?.sources.map((s) => s.sectionId)).toEqual(['cache'])
    expect(lesson?.sources[0]?.url).toMatch(/^https:/)
  })

  it('lists the Remediation Lessons newest round first, with round, notion and angle', () => {
    const round1 = failedRound(1)
    const round2 = failedRound(2)
    const first = remediation('cache-aside', round1.id, 'R1 cache-aside')
    const other = remediation('write-through', round1.id, 'R1 write-through')
    const second = remediation('cache-aside', round2.id, 'R2 cache-aside')
    const orphan = remediation('client-caching', null, 'No round')

    const { remediationLessons } = getLessonReview(db, corpus, topic.id)

    expect(remediationLessons.map((l) => l.id)).toEqual([second.id, first.id, other.id, orphan.id])
    expect(remediationLessons.map((l) => [l.roundNumber, l.notion.slug, l.angle])).toEqual([
      [2, 'cache-aside', 'analogy'],
      [1, 'cache-aside', 'concrete_example'],
      [1, 'write-through', 'concrete_example'],
      [null, 'client-caching', 'concrete_example']
    ])
    expect(remediationLessons[0]).toMatchObject({ markdown: 'R2 cache-aside', grounded: true })
  })

  it('does not mix topics', () => {
    const other = createTopic(db, { slug: 'cdn', title: 'CDN', position: 2 })
    const [otherNotion] = createNotions(db, [{ topicId: other.id, slug: 'edge', title: 'Edge' }])
    createLesson(db, { topicId: other.id, content: 'CDN lesson', grounded: false })
    createRemediationLesson(db, { notionId: otherNotion!.id, content: 'CDN', grounded: false })

    expect(getLessonReview(db, corpus, topic.id)).toMatchObject({
      lesson: null,
      remediationLessons: []
    })
  })

  it('refuses an unknown topic', () => {
    expect(() => getLessonReview(db, corpus, 999)).toThrow(/does not exist/)
  })
})

describe('mastery:getLessonReview', () => {
  const ipcWith = (allowLockedTopics: boolean) =>
    createMasteryIpc(
      { db, corpus, service: generation },
      createMasteryService({ db, corpus, service: generation, quiz: createQuizService(db) }),
      { assertTopicUnlocked: createTopicLockGuard({ db, corpus }, { allowLockedTopics }) }
    )

  const counts = () =>
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM lessons) AS lessons,
                (SELECT COUNT(*) FROM remediation_lessons) AS remediationLessons,
                (SELECT COUNT(*) FROM quizzes) AS quizzes,
                (SELECT COUNT(*) FROM rounds) AS rounds,
                (SELECT COUNT(*) FROM attempts) AS attempts,
                (SELECT COUNT(*) FROM content_cache) AS contentCache`
      )
      .get()

  it('reads the database only: no Generation, nothing recorded or altered', () => {
    createLesson(db, { topicId: topic.id, content: 'Lesson', grounded: true })
    remediation('cache-aside', failedRound(1).id, 'Remediation')
    const before = counts()
    const roundBefore = db.prepare('SELECT * FROM rounds').all()

    const review = ipcWith(false).getLessonReview({ topicId: topic.id })

    expect(review.lesson?.markdown).toBe('Lesson')
    expect(review.remediationLessons).toHaveLength(1)
    expect(runner).not.toHaveBeenCalled()
    expect(counts()).toEqual(before)
    expect(db.prepare('SELECT * FROM rounds').all()).toEqual(roundBefore)
  })

  it('validates the request', () => {
    const ipc = ipcWith(false)
    for (const request of [{}, { topicId: 'x' }, { topicId: 0 }, { topicId: 1.5 }, null]) {
      expect(() => ipc.getLessonReview(request as never)).toThrow()
    }
    expect(() => ipc.getLessonReview({ topicId: 999 })).toThrow(/does not exist/)
  })

  it('refuses a locked topic outside dev builds, like the Lesson', () => {
    createTopic(db, { slug: 'http', title: 'HTTP', position: 0, inFoundationsModule: true })

    expect(() => ipcWith(false).getLessonReview({ topicId: topic.id })).toThrow(
      /locked.*Master HTTP first/
    )
    // A dev build may open any topic.
    expect(ipcWith(true).getLessonReview({ topicId: topic.id }).lesson).toBeNull()
    expect(runner).not.toHaveBeenCalled()
  })

  it('serves a topic with progress even when it would otherwise be locked', () => {
    createTopic(db, { slug: 'http', title: 'HTTP', position: 0, inFoundationsModule: true })
    createLesson(db, { topicId: topic.id, content: 'Lesson', grounded: true })

    expect(ipcWith(false).getLessonReview({ topicId: topic.id }).lesson?.markdown).toBe('Lesson')
  })
})
