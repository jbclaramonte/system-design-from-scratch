import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  flagQuestion,
  listQuestions,
  recordAttempt,
  replaceQuestion
} from '../db/repositories/assessment'
import { createNotions, createTopic } from '../db/repositories/learningContent'
import { declareMastery } from '../db/repositories/mastery'
import { completeRecallSession, createRecallSession } from '../db/repositories/recall'
import type { QuestionType } from '../db/types'
import type { AttemptResult } from '../../shared/quiz'
import type { GenerationLanguage } from '../../shared/generationLanguage'
import { loadNotionResults, loadPassedTopics, loadRecallCandidates } from './queries'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`

/** A Topic with the given Notion slugs; returns the Topic and the Notion ids by slug. */
function seedTopic(slug: string, notionSlugs: string[] = ['a']) {
  const topic = createTopic(db, { slug, title: slug, position: 1 })
  const notions = createNotions(
    db,
    notionSlugs.map((notion) => ({ topicId: topic.id, slug: notion, title: notion }))
  )
  return { topic, notions: notions.map((notion) => notion.id) }
}

interface QuizSpec {
  type?: QuestionType
  notionIds: number[]
}

function seedQuiz(
  topicId: number,
  questions: QuizSpec[],
  options: { language?: GenerationLanguage; purpose?: 'round' | 'recall' } = {}
) {
  const quiz = createQuiz(db, {
    topicId,
    language: options.language,
    purpose: options.purpose,
    grounded: false,
    questions: questions.map((question, position) => ({
      position,
      type: question.type ?? 'single_choice',
      prompt: `Question ${position}`,
      body: {},
      notionIds: question.notionIds
    }))
  })
  return { quiz, questionIds: listQuestions(db, quiz.id).map((question) => question.id) }
}

/** A completed Round with one attempt per [questionId, result, day]. */
function playRound(
  topicId: number,
  quizId: number,
  number: number,
  answers: [number, AttemptResult, number][],
  complete = true
) {
  const round = createRound(db, { topicId, quizId, number })
  for (const [questionId, result, day] of answers) {
    recordAttempt(db, {
      questionId,
      roundId: round.id,
      answer: {},
      result,
      score: result === 'correct' ? 1 : 0,
      attemptedAt: at(day)
    })
  }
  if (complete) completeRound(db, round.id, { scorePercent: 50, passed: false })
  return round
}

function playRecall(
  questionIds: number[],
  answers: [number, AttemptResult, number][],
  complete = true
) {
  const session = createRecallSession(db, { kind: 'practice', topicId: null, questionIds })
  for (const [questionId, result, day] of answers) {
    recordAttempt(db, {
      questionId,
      recallSessionId: session.id,
      answer: {},
      result,
      score: result === 'correct' ? 1 : 0,
      attemptedAt: at(day)
    })
  }
  if (complete) completeRecallSession(db, session.id)
  return session
}

describe('loadNotionResults', () => {
  it('lists the results of a Notion oldest first across Rounds and Recall sessions', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [
      { notionIds: notions },
      { notionIds: notions }
    ])
    const [q1, q2] = questionIds as [number, number]
    // Played out of id order on purpose: the dates decide.
    playRound(topic.id, quiz.id, 2, [[q1, 'correct', 12]])
    playRound(topic.id, quiz.id, 1, [[q1, 'incorrect', 10]])
    playRecall([q2], [[q2, 'correct', 14]])
    expect(loadNotionResults(db).get(notions[0]!)).toEqual([false, true, true])
  })

  it('counts a Question once per session, with its final Attempt', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    const q = questionIds[0]!
    playRound(topic.id, quiz.id, 1, [
      [q, 'incorrect', 10],
      [q, 'correct', 11]
    ])
    expect(loadNotionResults(db).get(notions[0]!)).toEqual([true])
  })

  it('counts a Question again in another session', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    const q = questionIds[0]!
    playRound(topic.id, quiz.id, 1, [[q, 'incorrect', 10]])
    playRecall([q], [[q, 'correct', 11]])
    expect(loadNotionResults(db).get(notions[0]!)).toEqual([false, true])
  })

  it('counts partially correct and incorrect as missed', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [
      { notionIds: notions },
      { notionIds: notions },
      { notionIds: notions }
    ])
    const [q1, q2, q3] = questionIds as [number, number, number]
    playRound(topic.id, quiz.id, 1, [
      [q1, 'partially_correct', 10],
      [q2, 'incorrect', 11],
      [q3, 'correct', 12]
    ])
    expect(loadNotionResults(db).get(notions[0]!)).toEqual([false, false, true])
  })

  it('credits every Notion a Question is tagged with', () => {
    const { topic, notions } = seedTopic('cache', ['a', 'b'])
    const { quiz, questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    playRound(topic.id, quiz.id, 1, [[questionIds[0]!, 'correct', 10]])
    const results = loadNotionResults(db)
    expect(results.get(notions[0]!)).toEqual([true])
    expect(results.get(notions[1]!)).toEqual([true])
  })

  it('ignores an open Round and an open Recall session', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    const q = questionIds[0]!
    playRound(topic.id, quiz.id, 1, [[q, 'incorrect', 10]], false)
    playRecall([q], [[q, 'incorrect', 11]], false)
    expect(loadNotionResults(db).size).toBe(0)
  })

  it('ignores an Attempt outside any Round or Recall session', () => {
    const { topic, notions } = seedTopic('cache')
    const { questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    recordAttempt(db, { questionId: questionIds[0]!, answer: {}, result: 'correct', score: 1 })
    expect(loadNotionResults(db).size).toBe(0)
  })

  it('leaves out the Attempts on a question that was flagged and replaced', () => {
    const { topic, notions } = seedTopic('cache')
    const { quiz, questionIds } = seedQuiz(topic.id, [{ notionIds: notions }])
    const q = questionIds[0]!
    playRound(topic.id, quiz.id, 1, [[q, 'incorrect', 10]])
    flagQuestion(db, q, 'wrong key')
    replaceQuestion(db, q, {
      type: 'single_choice',
      prompt: 'Better',
      body: {},
      notionIds: notions
    })
    expect(loadNotionResults(db).size).toBe(0)
  })
})

describe('loadPassedTopics', () => {
  it('lists passed and declared Topics once, at the earliest date', () => {
    const cache = seedTopic('cache')
    const http = seedTopic('http')
    const dns = seedTopic('dns')
    const failed = seedTopic('failed')
    const quizOf = (topicId: number) => seedQuiz(topicId, []).quiz.id
    const pass = (topicId: number, number: number, passed: boolean, completedAt: string) => {
      const round = createRound(db, { topicId, quizId: quizOf(topicId), number })
      completeRound(db, round.id, { scorePercent: passed ? 100 : 0, passed })
      db.prepare('UPDATE rounds SET completed_at = $completedAt WHERE id = $id').run({
        id: round.id,
        completedAt
      })
    }
    pass(cache.topic.id, 1, false, at(1))
    pass(cache.topic.id, 2, true, at(5))
    pass(cache.topic.id, 3, true, at(8))
    pass(failed.topic.id, 1, false, at(2))
    declareMastery(db, http.topic.id)
    db.prepare('UPDATE declared_masteries SET created_at = $at WHERE topic_id = $id').run({
      id: http.topic.id,
      at: at(3)
    })
    declareMastery(db, dns.topic.id)
    db.prepare('UPDATE declared_masteries SET created_at = $at WHERE topic_id = $id').run({
      id: dns.topic.id,
      at: at(9)
    })
    pass(dns.topic.id, 1, true, at(4))

    const passed = loadPassedTopics(db)
    expect(passed.toSorted((a, b) => a.topicId - b.topicId)).toEqual([
      { topicId: cache.topic.id, passedAt: at(5) },
      { topicId: http.topic.id, passedAt: at(3) },
      { topicId: dns.topic.id, passedAt: at(4) }
    ])
  })
})

describe('loadRecallCandidates', () => {
  const load = (topicIds: number[], language: GenerationLanguage = 'fr') =>
    loadRecallCandidates(db, { topicIds, language })

  it('offers the usable questions of the given Topics, with their last asked time', () => {
    const cache = seedTopic('cache', ['a', 'b'])
    const http = seedTopic('http')
    const { quiz, questionIds } = seedQuiz(cache.topic.id, [
      { notionIds: [cache.notions[0]!] },
      { notionIds: cache.notions },
      { type: 'multiple_choice', notionIds: [cache.notions[1]!] },
      { type: 'scenario', notionIds: [cache.notions[1]!] }
    ])
    seedQuiz(http.topic.id, [{ notionIds: http.notions }])
    const [asked, , , scenario] = questionIds as [number, number, number, number]
    playRound(cache.topic.id, quiz.id, 1, [[asked, 'correct', 10]])
    playRecall(
      [asked, scenario],
      [
        [asked, 'incorrect', 15],
        [scenario, 'correct', 12]
      ]
    )

    const candidates = load([cache.topic.id])
    expect(candidates.map((candidate) => candidate.questionId)).toEqual(questionIds)
    expect(candidates[0]).toEqual({
      questionId: asked,
      topicId: cache.topic.id,
      notionIds: [cache.notions[0]],
      origin: 'reused',
      lastAskedAt: at(15)
    })
    expect(candidates[1]).toMatchObject({
      notionIds: cache.notions,
      origin: 'new',
      lastAskedAt: null
    })
    expect(candidates[3]).toMatchObject({ origin: 'reused', lastAskedAt: at(12) })
    expect(load([cache.topic.id, http.topic.id])).toHaveLength(5)
  })

  it('offers the questions of a recall quiz as well as those of a Round quiz', () => {
    const { topic, notions } = seedTopic('cache')
    seedQuiz(topic.id, [{ notionIds: notions }])
    seedQuiz(topic.id, [{ notionIds: notions }], { purpose: 'recall' })
    expect(load([topic.id])).toHaveLength(2)
  })

  it('leaves out a flagged question, a replaced one and a free-answer one', () => {
    const { topic, notions } = seedTopic('cache')
    const { questionIds } = seedQuiz(topic.id, [
      { notionIds: notions },
      { notionIds: notions },
      { notionIds: notions },
      { type: 'free_answer', notionIds: notions }
    ])
    const [kept, flagged, replaced] = questionIds as [number, number, number, number]
    flagQuestion(db, flagged, 'unclear')
    flagQuestion(db, replaced, 'wrong')
    const replacement = replaceQuestion(db, replaced, {
      type: 'single_choice',
      prompt: 'Better',
      body: {},
      notionIds: notions
    })
    expect(load([topic.id]).map((candidate) => candidate.questionId)).toEqual([
      kept,
      replacement.id
    ])
  })

  it('serves the Generation Language only', () => {
    const { topic, notions } = seedTopic('cache')
    const french = seedQuiz(topic.id, [{ notionIds: notions }], { language: 'fr' })
    const english = seedQuiz(topic.id, [{ notionIds: notions }], { language: 'en' })
    expect(load([topic.id], 'en').map((candidate) => candidate.questionId)).toEqual(
      english.questionIds
    )
    expect(load([topic.id], 'fr').map((candidate) => candidate.questionId)).toEqual(
      french.questionIds
    )
  })

  it('gives nothing for a Topic with Notions but no quiz, even a declared one', () => {
    const { topic } = seedTopic('cache', ['a', 'b'])
    declareMastery(db, topic.id)
    expect(load([topic.id])).toEqual([])
    expect(load([])).toEqual([])
  })

  it('gives the questions of a declared Topic that has some', () => {
    const { topic, notions } = seedTopic('cache')
    declareMastery(db, topic.id)
    const { questionIds } = seedQuiz(topic.id, [{ notionIds: notions }], { purpose: 'recall' })
    expect(load([topic.id]).map((candidate) => candidate.questionId)).toEqual(questionIds)
  })
})
