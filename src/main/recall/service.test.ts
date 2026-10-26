import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  completeRound,
  createQuiz,
  createRound,
  flagQuestion,
  listAttemptsByRecallSession,
  listQuestions,
  recordAttempt,
  replaceQuestion
} from '../db/repositories/assessment'
import { createNotions, createTopic } from '../db/repositories/learningContent'
import { declareMastery } from '../db/repositories/mastery'
import { createRecallSession } from '../db/repositories/recall'
import { updateSettings } from '../db/repositories/settings'
import type { QuestionType } from '../db/types'
import type { QuestionBrief } from '../generation/prompts/questionClarification'
import type { GenerationLanguage } from '../../shared/generationLanguage'
import type { AttemptResult } from '../../shared/quiz'
import type { QuestionClarifier } from '../quiz/questionClarifier'
import { createRecallService, type RecallService } from './service'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`

/** Choice 0 is the right one (the second for a multiple choice question is also right). */
const choiceBody = (type: QuestionType) => ({
  choices: [
    { text: 'Right', correct: true },
    { text: 'Also right', correct: type === 'multiple_choice' },
    { text: 'Wrong', correct: false }
  ],
  explanation: 'Because.'
})

interface SeededTopic {
  topicId: number
  notionIds: number[]
  /** Questions of the Round quiz, each answered once in a completed Round. */
  asked: number[]
  /** Questions of a recall quiz, never asked. */
  fresh: number[]
}

/**
 * A Topic passed on `day` (declared), with `askedCount` questions asked in a completed Round and
 * `freshCount` never asked. Every question is tagged with every Notion of the Topic.
 */
function seedTopic(
  slug: string,
  day: number,
  {
    askedCount = 4,
    freshCount = 4,
    notionSlugs = ['a'],
    language = 'fr'
  }: {
    askedCount?: number
    freshCount?: number
    notionSlugs?: string[]
    language?: GenerationLanguage
  } = {}
): SeededTopic {
  const topic = createTopic(db, { slug, title: `Title of ${slug}`, position: 1 })
  const notionIds = createNotions(
    db,
    notionSlugs.map((notion) => ({ topicId: topic.id, slug: `${slug}-${notion}`, title: notion }))
  ).map((notion) => notion.id)
  const questions = (count: number, offset: number) =>
    Array.from({ length: count }, (_, position) => ({
      position,
      type: 'single_choice' as const,
      prompt: `${slug} question ${offset + position}`,
      body: choiceBody('single_choice'),
      notionIds
    }))
  const roundQuiz = createQuiz(db, {
    topicId: topic.id,
    language,
    grounded: false,
    questions: questions(askedCount, 0)
  })
  const asked = listQuestions(db, roundQuiz.id).map((question) => question.id)
  const round = createRound(db, { topicId: topic.id, quizId: roundQuiz.id, number: 1 })
  for (const questionId of asked) {
    recordAttempt(db, {
      questionId,
      roundId: round.id,
      answer: { selected: [0] },
      result: 'correct',
      score: 1,
      attemptedAt: at(day)
    })
  }
  completeRound(db, round.id, { scorePercent: 100, passed: true })
  db.prepare('UPDATE rounds SET completed_at = $at WHERE id = $id').run({
    at: at(day),
    id: round.id
  })
  const recallQuiz = createQuiz(db, {
    topicId: topic.id,
    language,
    purpose: 'recall',
    grounded: false,
    questions: questions(freshCount, askedCount)
  })
  const fresh = listQuestions(db, recallQuiz.id).map((question) => question.id)
  return { topicId: topic.id, notionIds, asked, fresh }
}

/** A passed Topic with no history at all: declared on `day`. */
function seedDeclaredTopic(slug: string, day: number, freshCount = 4) {
  const seeded = seedTopic(slug, day, { askedCount: 0, freshCount })
  // Replace the passing Round by a declaration, keeping the questions.
  const roundIds = `SELECT id FROM rounds WHERE topic_id = $id`
  const attemptIds = `SELECT id FROM attempts WHERE round_id IN (${roundIds})`
  const params = { id: seeded.topicId }
  db.prepare(`DELETE FROM attempt_notions WHERE attempt_id IN (${attemptIds})`).run(params)
  db.prepare(`DELETE FROM attempts WHERE round_id IN (${roundIds})`).run(params)
  db.prepare('DELETE FROM rounds WHERE topic_id = $id').run(params)
  declareMastery(db, seeded.topicId)
  db.prepare('UPDATE declared_masteries SET created_at = $at WHERE topic_id = $id').run({
    at: at(day),
    id: seeded.topicId
  })
  return seeded
}

/**
 * Passed topics: `old` and `recent`; the learner opens `opening`, which has questions of its own
 * (never asked) that the gate must not pick.
 */
function seedThree() {
  const old = seedTopic('old', 10)
  const recent = seedTopic('recent', 14)
  const opening = createTopic(db, { slug: 'opening', title: 'Opening', position: 3 })
  const quiz = createQuiz(db, {
    topicId: opening.id,
    language: 'fr',
    purpose: 'recall',
    grounded: false,
    questions: Array.from({ length: 4 }, (_, position) => ({
      position,
      type: 'single_choice' as const,
      prompt: `opening question ${position}`,
      body: choiceBody('single_choice'),
      notionIds: []
    }))
  })
  const openingQuestions = listQuestions(db, quiz.id).map((question) => question.id)
  return { old, recent, opening: opening.id, openingQuestions }
}

const service = (options: Parameters<typeof createRecallService>[1] = {}) =>
  createRecallService(db, { now: () => new Date('2026-10-20T10:00:00.000Z'), ...options })

const answerRight = (recall: RecallService, sessionId: number, questionId: number) =>
  recall.submitAnswer(sessionId, { questionId, answer: { selected: [0] } })

describe('prepareGate', () => {
  it('returns null for the first Lesson', () => {
    const opening = createTopic(db, { slug: 'first', title: 'First', position: 1 })
    expect(service().prepareGate(opening.id)).toBeNull()
  })

  it('returns null with one passed Topic: it is the most recent one', () => {
    seedTopic('only', 10)
    const opening = createTopic(db, { slug: 'next', title: 'Next', position: 2 })
    expect(service().prepareGate(opening.id)).toBeNull()
  })

  it('returns null when the eligible Topics have no question to ask', () => {
    seedTopic('old', 10, { askedCount: 0, freshCount: 0 })
    seedTopic('recent', 14)
    const opening = createTopic(db, { slug: 'next', title: 'Next', position: 3 })
    expect(service().prepareGate(opening.id)).toBeNull()
  })

  it('asks up to 6 questions, none from the opening Topic or the most recent one', () => {
    const { old, recent, opening, openingQuestions } = seedThree()
    const start = service().prepareGate(opening)!

    expect(start.session).toMatchObject({ kind: 'gate', topicId: opening, completedAt: null })
    expect(start.questions).toHaveLength(6)
    const oldIds = new Set([...old.asked, ...old.fresh])
    expect(start.questions.every((question) => oldIds.has(question.id))).toBe(true)
    expect(start.questions.some((question) => recent.asked.includes(question.id))).toBe(false)
    expect(start.questions.some((question) => recent.fresh.includes(question.id))).toBe(false)
    expect(start.questions.some((question) => openingQuestions.includes(question.id))).toBe(false)
    expect(start.answered).toEqual([])
    expect(start.questions.map((question) => question.position)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('never sends an answer key', () => {
    const { opening } = seedThree()
    const start = service().prepareGate(opening)!

    expect(JSON.stringify(start)).not.toMatch(/correct|explanation|Because/)
    expect(start.questions[0]).toMatchObject({
      type: 'single_choice',
      choices: ['Right', 'Also right', 'Wrong'],
      gradable: true,
      recallHint: null
    })
  })

  it('draws from a declared Topic, whose questions are all new', () => {
    seedTopic('recent', 14)
    const declared = seedDeclaredTopic('declared', 10)
    const opening = createTopic(db, { slug: 'next', title: 'Next', position: 3 })
    const start = service().prepareGate(opening.id)!

    expect(start.questions.length).toBeGreaterThan(0)
    expect(start.questions.every((question) => declared.fresh.includes(question.id))).toBe(true)
  })

  it('resumes the open session, with the feedback of the answered questions', () => {
    const { opening } = seedThree()
    const recall = service()
    const first = recall.prepareGate(opening)!
    const questionId = first.questions[0]!.id
    answerRight(recall, first.session.id, questionId)

    const again = recall.prepareGate(opening)!

    expect(again.session.id).toBe(first.session.id)
    expect(again.questions.map((question) => question.id)).toEqual(
      first.questions.map((question) => question.id)
    )
    expect(again.answered).toHaveLength(1)
    expect(again.answered[0]).toMatchObject({ questionId, result: 'correct', kind: 'choice' })
  })

  it('returns null once the gate of that Topic is completed', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    for (const question of start.questions) answerRight(recall, start.session.id, question.id)
    recall.complete(start.session.id)

    expect(recall.prepareGate(opening)).toBeNull()
  })

  it('asks the questions of the current Generation Language only', () => {
    seedTopic('old', 10, { language: 'en' })
    seedTopic('recent', 14, { language: 'en' })
    const opening = createTopic(db, { slug: 'next', title: 'Next', position: 3 })

    // The Generation Language setting defaults to French.
    expect(service().prepareGate(opening.id)).toBeNull()
    updateSettings(db, { generationLanguage: 'en' })
    expect(service().prepareGate(opening.id)?.questions.length).toBeGreaterThan(0)
  })

  it('does not resume a session whose questions are not in the current language', () => {
    const { opening } = seedThree()
    const recall = service()
    expect(recall.prepareGate(opening)).not.toBeNull()
    updateSettings(db, { generationLanguage: 'en' })

    // Nothing in English: no gate, rather than a session in French.
    expect(recall.prepareGate(opening)).toBeNull()
  })

  it('resumes the original session after a language round-trip, with its answer', () => {
    const { opening } = seedThree()
    const recall = service()
    const first = recall.prepareGate(opening)!
    const questionId = first.questions[0]!.id
    answerRight(recall, first.session.id, questionId)

    updateSettings(db, { generationLanguage: 'en' })
    expect(recall.prepareGate(opening)).toBeNull()
    updateSettings(db, { generationLanguage: 'fr' })
    const again = recall.prepareGate(opening)!

    expect(again.session.id).toBe(first.session.id)
    expect(again.answered.map((feedback) => feedback.questionId)).toEqual([questionId])
  })

  it('resumes the session of the current language when another one is newer', () => {
    const { opening } = seedThree()
    const recall = service()
    const french = recall.prepareGate(opening)!
    seedTopic('old-en', 8, { language: 'en' })
    seedTopic('recent-en', 15, { language: 'en' })
    updateSettings(db, { generationLanguage: 'en' })
    const english = recall.prepareGate(opening)!
    expect(english.session.id).not.toBe(french.session.id)

    expect(recall.prepareGate(opening)!.session.id).toBe(english.session.id)
    updateSettings(db, { generationLanguage: 'fr' })
    expect(recall.prepareGate(opening)!.session.id).toBe(french.session.id)
  })

  it('tags a question on a Shaky Notion with how often it was missed', () => {
    const { old, opening } = seedThree()
    // Miss the Notion 3 times out of the last 4 answers, in completed Recall sessions.
    const [q1, q2, q3, q4] = old.fresh as [number, number, number, number]
    const results: [number, AttemptResult, number][] = [
      [q1, 'correct', 11],
      [q2, 'incorrect', 12],
      [q3, 'incorrect', 13],
      [q4, 'partially_correct', 14]
    ]
    for (const [questionId, result, day] of results) {
      const session = createRecallSession(db, {
        kind: 'practice',
        topicId: null,
        questionIds: [questionId]
      })
      recordAttempt(db, {
        questionId,
        recallSessionId: session.id,
        answer: {},
        result,
        score: 0,
        attemptedAt: at(day)
      })
      db.prepare('UPDATE recall_sessions SET completed_at = $at WHERE id = $id').run({
        at: at(day),
        id: session.id
      })
    }
    // The Round answered 4 questions correctly first: the last 6 answers are 3 correct, 3 missed.
    const start = service().prepareGate(opening)!

    expect(start.questions.every((question) => question.recallHint !== null)).toBe(true)
    expect(start.questions[0]!.recallHint).toEqual({ missed: 3, of: 6 })
  })
})

describe('submitAnswer', () => {
  it('records an Attempt with no Round and the Recall session', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    const questionId = start.questions[0]!.id

    const feedback = answerRight(recall, start.session.id, questionId)

    expect(feedback).toMatchObject({ questionId, result: 'correct', score: 1, kind: 'choice' })
    const [attempt] = listAttemptsByRecallSession(db, start.session.id)
    expect(attempt).toMatchObject({
      questionId,
      roundId: null,
      recallSessionId: start.session.id,
      result: 'correct'
    })
    expect(attempt!.notionIds.length).toBeGreaterThan(0)
  })

  it('grades a wrong answer as incorrect', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!

    const feedback = recall.submitAnswer(start.session.id, {
      questionId: start.questions[0]!.id,
      answer: { selected: [2] }
    })

    expect(feedback.result).toBe('incorrect')
  })

  it('refuses to answer the same question twice', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    const questionId = start.questions[0]!.id
    answerRight(recall, start.session.id, questionId)

    expect(() => answerRight(recall, start.session.id, questionId)).toThrow(/already answered/)
    expect(listAttemptsByRecallSession(db, start.session.id)).toHaveLength(1)
  })

  it('refuses a question outside the session', () => {
    const { old, opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    const asked = new Set(start.questions.map((question) => question.id))
    const outside = [...old.asked, ...old.fresh].find((id) => !asked.has(id))!

    expect(() => answerRight(recall, start.session.id, outside)).toThrow(/not part of/)
  })

  it('refuses an unknown or completed session', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    for (const question of start.questions) answerRight(recall, start.session.id, question.id)
    recall.complete(start.session.id)

    expect(() => answerRight(recall, 9999, 1)).toThrow(/does not exist/)
    expect(() => answerRight(recall, start.session.id, start.questions[0]!.id)).toThrow(/completed/)
  })

  it('refuses a free-answer question: only local grading is available', () => {
    const topic = createTopic(db, { slug: 'free', title: 'Free', position: 1 })
    const quiz = createQuiz(db, {
      topicId: topic.id,
      grounded: false,
      questions: [
        {
          position: 0,
          type: 'free_answer',
          prompt: 'Explain.',
          body: { expectedPoints: ['x'], modelAnswer: 'y' },
          notionIds: []
        }
      ]
    })
    const questionId = listQuestions(db, quiz.id)[0]!.id
    const session = createRecallSession(db, {
      kind: 'practice',
      topicId: null,
      questionIds: [questionId]
    })

    expect(() =>
      service().submitAnswer(session.id, { questionId, answer: { text: 'An answer' } })
    ).toThrow()
    expect(listAttemptsByRecallSession(db, session.id)).toHaveLength(0)
  })
})

describe('complete', () => {
  it('refuses while a question is unanswered', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    answerRight(recall, start.session.id, start.questions[0]!.id)

    expect(() => recall.complete(start.session.id)).toThrow(/unanswered/)
    expect(recall.prepareGate(opening)!.session.completedAt).toBeNull()
  })

  it('completes the session and counts correct answers per Notion', () => {
    seedTopic('recent', 14)
    const old = seedTopic('old', 10, { notionSlugs: ['a', 'b'], askedCount: 2, freshCount: 2 })
    const opening = createTopic(db, { slug: 'next', title: 'Next', position: 3 })
    const recall = service()
    const start = recall.prepareGate(opening.id)!
    expect(start.questions).toHaveLength(4)
    start.questions.forEach((question, index) => {
      // Two right, two wrong.
      recall.submitAnswer(start.session.id, {
        questionId: question.id,
        answer: { selected: [index < 2 ? 0 : 2] }
      })
    })

    const result = recall.complete(start.session.id)

    expect(result.session.completedAt).not.toBeNull()
    expect(result.questions.map((feedback) => feedback.questionId)).toEqual(
      start.questions.map((question) => question.id)
    )
    expect(result.notionOutcomes.map((outcome) => outcome.notion.id).sort()).toEqual(
      [...old.notionIds].sort()
    )
    for (const outcome of result.notionOutcomes) {
      expect(outcome).toMatchObject({ correct: 2, asked: 4 })
    }
  })

  it('counts only a fully correct answer as correct', () => {
    seedTopic('recent', 14)
    const old = seedTopic('old', 10, { askedCount: 1, freshCount: 0 })
    // Replace the old Topic's question by a multiple choice one.
    const multiple = createQuiz(db, {
      topicId: createTopic(db, { slug: 'm', title: 'M', position: 5 }).id,
      grounded: false,
      questions: [
        {
          position: 0,
          type: 'multiple_choice',
          prompt: 'Pick all',
          body: choiceBody('multiple_choice'),
          notionIds: old.notionIds
        }
      ]
    })
    const questionId = listQuestions(db, multiple.id)[0]!.id
    const session = createRecallSession(db, {
      kind: 'practice',
      topicId: null,
      questionIds: [questionId]
    })
    const recall = service()

    recall.submitAnswer(session.id, { questionId, answer: { selected: [0] } })
    const result = recall.complete(session.id)

    expect(result.questions[0]).toMatchObject({ result: 'partially_correct' })
    expect(result.notionOutcomes).toEqual([
      { notion: expect.objectContaining({ id: old.notionIds[0] }), correct: 0, asked: 1 }
    ])
  })

  it('refuses an unknown session', () => {
    expect(() => service().complete(9999)).toThrow(/does not exist/)
  })

  it('is idempotent: completing again returns the same result and keeps the first time', () => {
    const { opening } = seedThree()
    const recall = service()
    const start = recall.prepareGate(opening)!
    for (const question of start.questions) answerRight(recall, start.session.id, question.id)
    const first = recall.complete(start.session.id)

    const second = recall.complete(start.session.id)

    expect(second).toEqual(first)
    expect(second.session.completedAt).toBe(first.session.completedAt)
    expect(listAttemptsByRecallSession(db, start.session.id)).toHaveLength(start.questions.length)
  })
})

describe('startPractice', () => {
  it('returns null when nothing is passed or no question exists', () => {
    expect(service().startPractice()).toBeNull()
    seedTopic('empty', 10, { askedCount: 0, freshCount: 0 })
    expect(service().startPractice()).toBeNull()
  })

  it('starts a practice session on the passed Topics, the most recent included', () => {
    const { old, recent } = seedThree()
    const start = service().startPractice()!

    expect(start.session).toMatchObject({ kind: 'practice', topicId: null })
    expect(start.questions).toHaveLength(6)
    const ids = new Set([...old.asked, ...old.fresh, ...recent.asked, ...recent.fresh])
    expect(start.questions.every((question) => ids.has(question.id))).toBe(true)
  })

  it('restricts the questions to the given Notions, and may use the most recent Topic', () => {
    const old = seedTopic('old', 10, { notionSlugs: ['a', 'b'] })
    const recent = seedTopic('recent', 14)
    const [notionId] = recent.notionIds as [number]

    const start = service().startPractice([notionId])!

    expect(start.questions.length).toBeGreaterThan(0)
    expect(
      start.questions.every((question) => recent.asked.concat(recent.fresh).includes(question.id))
    ).toBe(true)
    expect(
      start.questions.every((question) => question.notions.some((n) => n.id === notionId))
    ).toBe(true)
    expect(old.notionIds).not.toContain(notionId)
  })

  it('returns null for a Notion of a Topic that is not passed', () => {
    seedThree()
    const unpassed = seedTopic('unpassed', 20)
    db.prepare('UPDATE rounds SET passed = 0 WHERE topic_id = $id').run({ id: unpassed.topicId })

    expect(service().startPractice(unpassed.notionIds)).toBeNull()
  })

  it('returns null for an empty list of Notions', () => {
    seedThree()
    expect(service().startPractice([])).toBeNull()
  })

  it('does not block the gate of a Topic: a practice session is not a gate', () => {
    const { opening } = seedThree()
    const recall = service()
    const practice = recall.startPractice()!
    for (const question of practice.questions) answerRight(recall, practice.session.id, question.id)
    recall.complete(practice.session.id)

    expect(recall.prepareGate(opening)).not.toBeNull()
  })
})

describe('clarifyQuestion', () => {
  const fakeClarifier = () => {
    const briefs: QuestionBrief[] = []
    const clarifier: QuestionClarifier = {
      clarify: vi.fn(async (brief) => {
        briefs.push(brief)
        return { clarification: { rewording: 'Reworded', example: 'Example' }, fromCache: false }
      })
    }
    return { clarifier, briefs }
  }

  it('builds the brief from the question and its own quiz, without the answer key', async () => {
    const { opening } = seedThree()
    const { clarifier, briefs } = fakeClarifier()
    const recall = service({ questionClarifier: clarifier })
    const start = recall.prepareGate(opening)!
    const question = start.questions[0]!

    const outcome = await recall.clarifyQuestion(start.session.id, question.id, { another: true })

    expect(outcome).toEqual({
      clarification: { rewording: 'Reworded', example: 'Example' },
      fromCache: false
    })
    expect(clarifier.clarify).toHaveBeenCalledWith(expect.anything(), { another: true })
    expect(briefs[0]).toEqual({
      questionId: question.id,
      type: 'single_choice',
      prompt: question.prompt,
      scenario: null,
      choices: ['Right', 'Also right', 'Wrong'],
      topicTitle: 'Title of old',
      language: 'fr'
    })
  })

  it('refuses an answered question, a question outside the session, and a missing clarifier', async () => {
    const { opening } = seedThree()
    const { clarifier } = fakeClarifier()
    const recall = service({ questionClarifier: clarifier })
    const start = recall.prepareGate(opening)!
    const first = start.questions[0]!
    const second = start.questions[1]!
    answerRight(recall, start.session.id, first.id)

    await expect(recall.clarifyQuestion(start.session.id, first.id)).rejects.toThrow(/answered/)
    await expect(recall.clarifyQuestion(start.session.id, 9999)).rejects.toThrow(/not part of/)
    await expect(service().clarifyQuestion(start.session.id, second.id)).rejects.toThrow(
      /not available/
    )
    expect(clarifier.clarify).not.toHaveBeenCalled()
  })
})

describe('getMemoryReview', () => {
  /** A completed Recall session with one answer per [questionId, result], one day apart. */
  function playRecall(answers: [number, AttemptResult][], firstDay: number) {
    answers.forEach(([questionId, result], index) => {
      const session = createRecallSession(db, {
        kind: 'practice',
        topicId: null,
        questionIds: [questionId]
      })
      recordAttempt(db, {
        questionId,
        recallSessionId: session.id,
        answer: {},
        result,
        score: result === 'correct' ? 1 : 0,
        attemptedAt: at(firstDay + index)
      })
      db.prepare('UPDATE recall_sessions SET completed_at = $at WHERE id = $id').run({
        at: at(firstDay + index),
        id: session.id
      })
    })
  }

  it('is empty without any answer', () => {
    expect(service().getMemoryReview()).toEqual({
      tracked: 0,
      needsAttention: 0,
      steadier: 0,
      solid: 0,
      groups: { needs_attention: [], steadier: [], solid: [] }
    })
  })

  it('groups Notions by status, leaves untracked ones out, and counts the three groups', () => {
    const shaky = seedTopic('shaky', 10, { askedCount: 0, freshCount: 6, notionSlugs: ['s'] })
    const solid = seedTopic('solid', 10, { askedCount: 0, freshCount: 4, notionSlugs: ['o'] })
    const untracked = seedTopic('untracked', 10, {
      askedCount: 0,
      freshCount: 1,
      notionSlugs: ['u']
    })
    // 3 misses in the last 6 answers (4 right then 3 wrong... window of 6: R R R W W W).
    const [s1, s2, s3, s4, s5, s6] = shaky.fresh as [number, number, number, number, number, number]
    playRecall(
      [
        [s1, 'correct'],
        [s2, 'correct'],
        [s3, 'correct'],
        [s4, 'incorrect'],
        [s5, 'incorrect'],
        [s6, 'partially_correct']
      ],
      11
    )
    playRecall(
      solid.fresh.map((id) => [id, 'correct'] as [number, AttemptResult]),
      11
    )
    playRecall([[untracked.fresh[0]!, 'incorrect']], 11)

    const review = service().getMemoryReview()

    expect(review.groups.needs_attention.map((row) => row.notion.id)).toEqual(shaky.notionIds)
    expect(review.groups.solid.map((row) => row.notion.id)).toEqual(solid.notionIds)
    expect(review.groups.steadier).toEqual([])
    const everyGroup = Object.values(review.groups).flat()
    expect(everyGroup.some((row) => row.notion.id === untracked.notionIds[0])).toBe(false)
    expect(review).toMatchObject({ needsAttention: 1, steadier: 0, solid: 1, tracked: 2 })
    expect(review.tracked).toBe(review.needsAttention + review.steadier + review.solid)
    expect(review.groups.needs_attention[0]).toEqual({
      notion: { id: shaky.notionIds[0], slug: 'shaky-s', title: 's' },
      topicTitle: 'Title of shaky',
      topicSlug: 'shaky',
      lastResults: [true, true, true, false, false, false],
      missed: 3,
      of: 6,
      lastSeenAt: at(16),
      sourceSections: []
    })
  })

  it('shows a last seen time no more recent than the visible results (replaced questions)', () => {
    const topic = seedTopic('seen', 10, { askedCount: 0, freshCount: 3, notionSlugs: ['t'] })
    const [a, b, c] = topic.fresh as [number, number, number]
    playRecall(
      [
        [a, 'correct'],
        [b, 'incorrect'],
        [c, 'correct']
      ],
      11
    )
    // The last answer (day 13) was on a question that was flagged and replaced since.
    flagQuestion(db, c, 'wrong key')
    replaceQuestion(db, c, {
      type: 'single_choice',
      prompt: 'Better',
      body: choiceBody('single_choice'),
      notionIds: topic.notionIds
    })

    const [row] = service().getMemoryReview().groups.steadier

    expect(row).toMatchObject({ lastResults: [true, false], lastSeenAt: at(12) })
  })

  it('puts a Notion with 1 or 2 misses under steadier, counting only the last 6 answers', () => {
    const topic = seedTopic('steady', 10, { askedCount: 0, freshCount: 8, notionSlugs: ['t'] })
    // Eight answers, the first three missed: only the last 6 count (W C C C C W: 2 missed, not 4 in a row).
    const [a, b, c, d, e, f, g, h] = topic.fresh as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number
    ]
    playRecall(
      [
        [a, 'incorrect'],
        [b, 'incorrect'],
        [c, 'incorrect'],
        [d, 'correct'],
        [e, 'correct'],
        [f, 'correct'],
        [g, 'correct'],
        [h, 'incorrect']
      ],
      11
    )

    const review = service().getMemoryReview()

    expect(review.groups.steadier).toHaveLength(1)
    expect(review.groups.steadier[0]).toMatchObject({ missed: 2, of: 6 })
    expect(review).toMatchObject({ needsAttention: 0, steadier: 1, solid: 0, tracked: 1 })
  })
})
