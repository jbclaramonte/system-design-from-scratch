import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../driver'
import { migrate } from '../migrate'
import { migrations } from '../migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  flagQuestion,
  getQuestion,
  listAttemptsByNotion,
  listAttemptsByRound,
  listQuestionHistory,
  listQuestions,
  recordAttempt,
  replaceQuestion
} from './assessment'
import { contentCacheKey, getCachedContent, putCachedContent } from './contentCache'
import {
  addDesignFeedback,
  createDesignExercise,
  getDesignScene,
  listDesignFeedback,
  saveDesignScene
} from './designPractice'
import {
  createLesson,
  createNotion,
  createNotions,
  createRemediationLesson,
  createTopic,
  getTopicBySlug,
  listLessonsByTopic,
  listNotionsByTopic,
  listRemediationLessonsByNotion,
  listTopics
} from './learningContent'
import { getSettings, updateSettings } from './settings'

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

function seedTopic() {
  const topic = createTopic(db, {
    slug: 'cache',
    title: 'Cache',
    position: 1,
    sourceSection: 'cache'
  })
  const cacheAside = createNotion(db, {
    topicId: topic.id,
    slug: 'cache-aside',
    title: 'Cache-aside'
  })
  const writeThrough = createNotion(db, {
    topicId: topic.id,
    slug: 'write-through',
    title: 'Write-through'
  })
  return { topic, cacheAside, writeThrough }
}

describe('learning content', () => {
  it('round-trips topics, notions, lessons and remediation lessons', () => {
    const { topic, cacheAside } = seedTopic()
    createTopic(db, { slug: 'http', title: 'HTTP', position: 0, inFoundationsModule: true })

    expect(topic).toMatchObject({
      slug: 'cache',
      inFoundationsModule: false,
      sourceSection: 'cache'
    })
    expect(topic.createdAt).toMatch(ISO)
    expect(listTopics(db).map((t) => t.slug)).toEqual(['http', 'cache'])
    expect(getTopicBySlug(db, 'http')?.inFoundationsModule).toBe(true)
    expect(listNotionsByTopic(db, topic.id).map((n) => n.slug)).toEqual([
      'cache-aside',
      'write-through'
    ])

    createLesson(db, {
      topicId: topic.id,
      content: '# Cache',
      grounded: true,
      sourceSections: ['cache']
    })
    expect(listLessonsByTopic(db, topic.id)).toEqual([
      expect.objectContaining({ content: '# Cache', grounded: true, sourceSections: ['cache'] })
    ])

    createRemediationLesson(db, { notionId: cacheAside.id, content: 'Analogy', grounded: false })
    expect(listRemediationLessonsByNotion(db, cacheAside.id)).toEqual([
      expect.objectContaining({
        content: 'Analogy',
        grounded: false,
        sourceSections: [],
        roundId: null
      })
    ])
  })

  it('stores the source sections of a Notion Outline, in order', () => {
    const topic = createTopic(db, { slug: 'lb', title: 'Load balancer', position: 1 })
    const notions = createNotions(db, [
      { topicId: topic.id, slug: 'layer-4', title: 'Layer 4', sourceSections: ['lb/l4'] },
      { topicId: topic.id, slug: 'layer-7', title: 'Layer 7', description: 'HTTP aware.' }
    ])
    expect(listNotionsByTopic(db, topic.id)).toEqual(notions)
    expect(notions.map((n) => n.sourceSections)).toEqual([['lb/l4'], []])
    expect(() =>
      createNotions(db, [
        { topicId: topic.id, slug: 'new', title: 'New' },
        { topicId: topic.id, slug: 'layer-4', title: 'Duplicate' }
      ])
    ).toThrow(/UNIQUE/)
    expect(listNotionsByTopic(db, topic.id)).toHaveLength(2)
  })

  it('enforces unique slugs and existing parents', () => {
    const { topic } = seedTopic()
    expect(() => createTopic(db, { slug: 'cache', title: 'Again', position: 2 })).toThrow(/UNIQUE/)
    expect(() => createNotion(db, { topicId: topic.id, slug: 'cache-aside', title: 'x' })).toThrow(
      /UNIQUE/
    )
    expect(() => createNotion(db, { topicId: 999, slug: 'x', title: 'x' })).toThrow(/FOREIGN KEY/)
  })
})

describe('assessment', () => {
  function seedQuiz() {
    const seed = seedTopic()
    const quiz = createQuiz(db, {
      topicId: seed.topic.id,
      grounded: true,
      sourceSections: ['cache'],
      questions: [
        {
          position: 0,
          type: 'single_choice',
          prompt: 'Which pattern loads on miss?',
          body: { choices: ['cache-aside', 'write-through'], answer: 0 },
          notionIds: [seed.cacheAside.id]
        },
        {
          position: 1,
          type: 'free_answer',
          prompt: 'Compare both patterns.',
          body: { rubric: 'mentions consistency' },
          notionIds: [seed.cacheAside.id, seed.writeThrough.id]
        }
      ]
    })
    return { ...seed, quiz }
  }

  it('creates a quiz with tagged questions', () => {
    const { quiz, cacheAside, writeThrough } = seedQuiz()
    const questions = listQuestions(db, quiz.id)
    expect(questions.map((q) => q.type)).toEqual(['single_choice', 'free_answer'])
    expect(questions[0]?.body).toEqual({ choices: ['cache-aside', 'write-through'], answer: 0 })
    expect(questions[1]?.notionIds).toEqual([cacheAside.id, writeThrough.id])
  })

  it('rolls back the whole quiz when a question is invalid', () => {
    const { topic } = seedTopic()
    expect(() =>
      createQuiz(db, {
        topicId: topic.id,
        grounded: true,
        questions: [{ position: 0, type: 'essay' as never, prompt: 'x', body: {}, notionIds: [] }]
      })
    ).toThrow(/CHECK/)
    expect(db.prepare('SELECT COUNT(*) AS n FROM quizzes').get()).toEqual({ n: 0 })
  })

  it('numbers rounds uniquely per topic', () => {
    const { topic, quiz } = seedQuiz()
    createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    createRound(db, { topicId: topic.id, quizId: quiz.id, number: 2 })
    expect(() => createRound(db, { topicId: topic.id, quizId: quiz.id, number: 2 })).toThrow()
  })

  it('records attempts with a round, the question type and notions, queryable per notion', () => {
    const { topic, quiz, cacheAside, writeThrough } = seedQuiz()
    const [mcq, free] = listQuestions(db, quiz.id)
    const round = createRound(db, { topicId: topic.id, quizId: quiz.id, number: 1 })
    expect(round).toMatchObject({ completedAt: null, scorePercent: null, passed: null })

    recordAttempt(db, {
      questionId: mcq!.id,
      roundId: round.id,
      answer: 0,
      result: 'correct',
      score: 1,
      attemptedAt: '2026-01-01T10:00:00.000Z'
    })
    const attempt = recordAttempt(db, {
      questionId: free!.id,
      roundId: round.id,
      answer: 'They differ on writes.',
      result: 'partially_correct',
      score: 0.5,
      feedback: 'Missing consistency.'
    })
    expect(attempt).toMatchObject({
      questionType: 'free_answer',
      notionIds: [cacheAside.id, writeThrough.id],
      answer: 'They differ on writes.'
    })
    expect(attempt.attemptedAt).toMatch(ISO)

    expect(listAttemptsByNotion(db, cacheAside.id).map((a) => a.questionId)).toEqual([
      mcq!.id,
      free!.id
    ])
    expect(listAttemptsByNotion(db, writeThrough.id).map((a) => a.questionId)).toEqual([free!.id])
    expect(listAttemptsByRound(db, round.id)).toHaveLength(2)

    const completed = completeRound(db, round.id, { scorePercent: 75, passed: false })
    expect(completed).toMatchObject({ scorePercent: 75, passed: false })
    expect(completed.completedAt).toMatch(ISO)
  })

  it('keeps attempt notions when the question is retagged', () => {
    const { quiz, cacheAside } = seedQuiz()
    const question = listQuestions(db, quiz.id)[0]!
    recordAttempt(db, { questionId: question.id, answer: 1, result: 'incorrect', score: 0 })
    db.prepare('DELETE FROM question_notions WHERE question_id = $id').run({ id: question.id })
    expect(getQuestion(db, question.id)?.notionIds).toEqual([])
    expect(listAttemptsByNotion(db, cacheAside.id)).toHaveLength(1)
  })

  it('flags a question and swaps in its replacement, keeping the flagged one as history', () => {
    const { quiz, cacheAside } = seedQuiz()
    const [first, second] = listQuestions(db, quiz.id)
    recordAttempt(db, { questionId: first!.id, answer: 1, result: 'incorrect', score: 0 })
    expect(first).toMatchObject({ flaggedAt: null, flagReason: null, replacedByQuestionId: null })
    expect(() => replaceQuestion(db, first!.id, { ...first!, notionIds: [] })).toThrow(
      /not flagged/
    )

    const flagged = flagQuestion(db, first!.id, 'Two answers are correct.')
    expect(flagged.flaggedAt).toMatch(ISO)
    expect(flagged.flagReason).toBe('Two answers are correct.')

    const replacement = replaceQuestion(db, first!.id, {
      type: 'single_choice',
      prompt: 'Which pattern reads the database on a miss?',
      body: { choices: ['cache-aside', 'write-through'], answer: 0 },
      notionIds: [cacheAside.id]
    })
    expect(replacement).toMatchObject({ position: 0, notionIds: [cacheAside.id] })
    expect(listQuestions(db, quiz.id).map((q) => q.id)).toEqual([replacement.id, second!.id])
    expect(listQuestionHistory(db, quiz.id).map((q) => q.id)).toEqual([
      replacement.id,
      second!.id,
      first!.id
    ])
    expect(getQuestion(db, first!.id)).toMatchObject({
      position: 2,
      replacedByQuestionId: replacement.id,
      flagReason: 'Two answers are correct.'
    })
    expect(listAttemptsByNotion(db, cacheAside.id).map((a) => a.questionId)).toEqual([first!.id])
    expect(() => replaceQuestion(db, first!.id, { ...replacement, notionIds: [] })).toThrow(
      /already replaced/
    )
    expect(() => flagQuestion(db, 999, null)).toThrow(/does not exist/)
  })

  it('enforces attempt constraints and protects the history', () => {
    const { quiz } = seedQuiz()
    const question = listQuestions(db, quiz.id)[0]!
    expect(() =>
      recordAttempt(db, { questionId: 999, answer: 0, result: 'correct', score: 1 })
    ).toThrow(/does not exist/)
    expect(() =>
      recordAttempt(db, { questionId: question.id, answer: 0, result: 'correct', score: 2 })
    ).toThrow(/CHECK/)
    expect(() =>
      recordAttempt(db, { questionId: question.id, answer: 0, result: 'wrong' as never, score: 0 })
    ).toThrow(/CHECK/)
    recordAttempt(db, { questionId: question.id, answer: 0, result: 'correct', score: 1 })
    expect(() => db.prepare('DELETE FROM quizzes WHERE id = $id').run({ id: quiz.id })).toThrow(
      /FOREIGN KEY/
    )
  })
})

describe('design practice', () => {
  it('saves one scene per exercise and records feedback per protocol step', () => {
    const exercise = createDesignExercise(db, {
      slug: 'pastebin',
      title: 'Pastebin',
      position: 0,
      grounded: true,
      referenceSolutionSection: 'pastebin'
    })
    saveDesignScene(db, exercise.id, { shapes: [] })
    const scene = saveDesignScene(db, exercise.id, { shapes: [{ type: 'cache' }] })
    expect(getDesignScene(db, exercise.id)).toEqual(scene)
    expect(scene.snapshot).toEqual({ shapes: [{ type: 'cache' }] })

    addDesignFeedback(db, {
      designExerciseId: exercise.id,
      kind: 'step_feedback',
      protocolStep: 'functional_requirements',
      content: { gaps: ['no expiry'] },
      grounded: true
    })
    addDesignFeedback(db, {
      designExerciseId: exercise.id,
      kind: 'final_review',
      protocolStep: null,
      content: { summary: 'ok' },
      grounded: true
    })
    expect(listDesignFeedback(db, exercise.id).map((f) => f.protocolStep)).toEqual([
      'functional_requirements',
      null
    ])
    expect(() =>
      addDesignFeedback(db, {
        designExerciseId: exercise.id,
        kind: 'hint',
        protocolStep: null,
        content: 'x',
        grounded: false
      })
    ).toThrow(/CHECK/)
  })

  it('requires a reference solution for grounded exercises', () => {
    expect(() =>
      createDesignExercise(db, { slug: 'x', title: 'X', position: 0, grounded: true })
    ).toThrow(/CHECK/)
  })
})

describe('content cache', () => {
  it('keys on kind, inputs and prompt version, independently of property order', () => {
    const key = contentCacheKey('lesson', { topic: 'cache', level: 1 }, 'v1')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(contentCacheKey('lesson', { level: 1, topic: 'cache' }, 'v1')).toBe(key)
    expect(contentCacheKey('lesson', { topic: 'cache', level: 1 }, 'v2')).not.toBe(key)
    expect(contentCacheKey('quiz', { topic: 'cache', level: 1 }, 'v1')).not.toBe(key)
  })

  it('stores and replaces entries', () => {
    const entry = {
      kind: 'lesson' as const,
      inputs: { topic: 'cache' },
      promptVersion: 'v1',
      content: { markdown: 'first' },
      grounded: true,
      sourceSections: ['cache']
    }
    const stored = putCachedContent(db, entry)
    expect(getCachedContent(db, stored.cacheKey)).toEqual(stored)
    const replaced = putCachedContent(db, { ...entry, content: { markdown: 'second' } })
    expect(replaced.cacheKey).toBe(stored.cacheKey)
    expect(replaced.content).toEqual({ markdown: 'second' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM content_cache').get()).toEqual({ n: 1 })
  })
})

describe('settings', () => {
  it('has seeded defaults and persists updates', () => {
    const defaults = {
      masteryThreshold: 100,
      roundLimit: 3,
      questionsPerQuiz: null,
      claudeCliPath: null,
      claudeConfigDir: null
    }
    expect(getSettings(db)).toEqual(defaults)
    expect(updateSettings(db, { roundLimit: 5 })).toEqual({ ...defaults, roundLimit: 5 })
    expect(getSettings(db).roundLimit).toBe(5)
    expect(updateSettings(db, { claudeCliPath: '/opt/claude' }).claudeCliPath).toBe('/opt/claude')
    expect(updateSettings(db, { claudeCliPath: null }).claudeCliPath).toBeNull()
  })

  it('reads the Claude config directory as null until it is first saved (no migration)', () => {
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'claude_config_dir'").get()
    ).toEqual({ n: 0 })
    expect(getSettings(db).claudeConfigDir).toBeNull()
    expect(updateSettings(db, { claudeConfigDir: '/Users/me/.claude-perso' }).claudeConfigDir).toBe(
      '/Users/me/.claude-perso'
    )
    expect(updateSettings(db, { claudeConfigDir: null }).claudeConfigDir).toBeNull()
  })
})
