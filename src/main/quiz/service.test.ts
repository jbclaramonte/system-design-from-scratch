import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  createQuiz,
  flagQuestion,
  getRound,
  listAttemptsByNotion,
  listAttemptsByRound,
  replaceQuestion
} from '../db/repositories/assessment'
import { createNotions, createTopic } from '../db/repositories/learningContent'
import { updateSettings } from '../db/repositories/settings'
import { createDevQuiz, DEV_QUIZ_TOPIC_SLUG } from './devFixture'
import { createQuizService, type QuizService } from './service'

let db: Database
let service: QuizService

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  service = createQuizService(db)
})

afterEach(() => db.close())

const choices = (...correct: boolean[]) =>
  correct.map((isCorrect, index) => ({ text: `Choix ${index}`, correct: isCorrect }))

/** Topic with notions a, b and a quiz: q0 single [a] (1 correct), q1 multiple [a, b] (0, 2), q2 free [b]. */
function seed() {
  const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 0 })
  const [a, b] = createNotions(db, [
    { topicId: topic.id, slug: 'a', title: 'Notion A' },
    { topicId: topic.id, slug: 'b', title: 'Notion B' }
  ])
  const quiz = createQuiz(db, {
    topicId: topic.id,
    grounded: true,
    questions: [
      {
        position: 0,
        type: 'single_choice',
        prompt: 'Q0',
        body: { choices: choices(false, true, false), explanation: 'E0', sourceSections: [] },
        notionIds: [a!.id]
      },
      {
        position: 1,
        type: 'multiple_choice',
        prompt: 'Q1',
        body: { choices: choices(true, false, true, false), explanation: 'E1', sourceSections: [] },
        notionIds: [a!.id, b!.id]
      },
      {
        position: 2,
        type: 'free_answer',
        prompt: 'Q2',
        body: { expectedPoints: ['p'], modelAnswer: 'm', sourceSections: [] },
        notionIds: [b!.id]
      }
    ]
  })
  const [q0, q1, q2] = service.loadQuiz(quiz.id).questions.map((q) => q.id)
  return { topic, a: a!, b: b!, quiz, q0: q0!, q1: q1!, q2: q2! }
}

describe('loadQuiz', () => {
  it('sends choice texts, scenario and notions, never the answer key or explanation', () => {
    const { quiz, a, b } = seed()

    const view = service.loadQuiz(quiz.id)

    expect(view.topicTitle).toBe('Cache')
    expect(view.questions.map((q) => [q.type, q.gradable])).toEqual([
      ['single_choice', true],
      ['multiple_choice', true],
      ['free_answer', false]
    ])
    expect(view.questions[1]!.choices).toEqual(['Choix 0', 'Choix 1', 'Choix 2', 'Choix 3'])
    expect(view.questions[1]!.notions.map((n) => n.id)).toEqual([a.id, b.id])
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('correct')
    expect(serialized).not.toContain('E0')
    expect(serialized).not.toContain('modelAnswer')
  })

  it('throws on an unknown quiz', () => {
    expect(() => service.loadQuiz(42)).toThrow(/Quiz 42 does not exist/)
  })
})

describe('rounds', () => {
  it('numbers rounds per topic, never restarting, across quizzes', () => {
    const { topic, quiz, q0, q1 } = seed()
    const first = service.startRound(quiz.id).round
    service.completeRound(first.id, [
      { questionId: q0, answer: { selected: [1] } },
      { questionId: q1, answer: { selected: [0, 2] } }
    ])
    const second = service.startRound(quiz.id).round
    const otherQuiz = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
    const otherTopic = createTopic(db, { slug: 'dns', title: 'DNS', position: 1 })
    const otherTopicQuiz = createQuiz(db, {
      topicId: otherTopic.id,
      grounded: false,
      questions: []
    })

    expect(first.number).toBe(1)
    expect(second.number).toBe(2)
    expect(service.startRound(otherQuiz.id).round.number).toBe(3)
    expect(service.startRound(otherTopicQuiz.id).round.number).toBe(1)
  })

  it('resumes the open round of a quiz with its answered questions', () => {
    const { quiz, q0 } = seed()
    const { round } = service.startRound(quiz.id)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [0] } })

    const resumed = service.startRound(quiz.id)

    expect(resumed.round.id).toBe(round.id)
    expect(resumed.answered).toHaveLength(1)
    expect(resumed.answered[0]).toMatchObject({ questionId: q0, result: 'incorrect', score: 0 })
    expect(resumed.answered[0]!.choices[1]).toEqual({
      text: 'Choix 1',
      correct: true,
      selected: false
    })
  })
})

describe('submitAnswer', () => {
  it('grades in main and records an Attempt tagged with the question notions', () => {
    const { quiz, q1, a, b } = seed()
    const { round } = service.startRound(quiz.id)

    const feedback = service.submitAnswer(round.id, {
      questionId: q1,
      answer: { selected: [2, 0, 2] }
    })

    expect(feedback).toMatchObject({ result: 'correct', score: 1, explanation: 'E1' })
    const [attempt] = listAttemptsByRound(db, round.id)
    expect(attempt).toMatchObject({
      questionId: q1,
      roundId: round.id,
      questionType: 'multiple_choice',
      answer: { selected: [0, 2] },
      result: 'correct',
      score: 1,
      feedback: null,
      notionIds: [a.id, b.id]
    })
    expect(listAttemptsByNotion(db, b.id)).toHaveLength(1)
  })

  it('records a partially correct multiple choice with score 0', () => {
    const { quiz, q1 } = seed()
    const { round } = service.startRound(quiz.id)

    service.submitAnswer(round.id, { questionId: q1, answer: { selected: [0] } })

    expect(listAttemptsByRound(db, round.id)[0]).toMatchObject({
      result: 'partially_correct',
      score: 0
    })
  })

  it('refuses a second answer to the same question in a round', () => {
    const { quiz, q0 } = seed()
    const { round } = service.startRound(quiz.id)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [0] } })

    expect(() =>
      service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    ).toThrow(/already answered/)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(1)
  })

  it('refuses a question of another quiz, a replaced one, and a free answer (no grader)', () => {
    const { topic, quiz, q0, q2 } = seed()
    const other = createQuiz(db, {
      topicId: topic.id,
      grounded: false,
      questions: [
        {
          position: 0,
          type: 'single_choice',
          prompt: 'Other',
          body: { choices: choices(true, false, false), explanation: 'E' },
          notionIds: []
        }
      ]
    })
    const otherQuestion = service.loadQuiz(other.id).questions[0]!.id
    const { round } = service.startRound(quiz.id)
    flagQuestion(db, q0, 'faux')
    replaceQuestion(db, q0, {
      type: 'single_choice',
      prompt: 'Q0 bis',
      body: { choices: choices(true, false, false), explanation: 'E' },
      notionIds: []
    })

    expect(() =>
      service.submitAnswer(round.id, { questionId: otherQuestion, answer: { selected: [0] } })
    ).toThrow(/not part of round 1/)
    expect(() =>
      service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    ).toThrow(/was replaced/)
    expect(() =>
      service.submitAnswer(round.id, { questionId: q2, answer: { selected: [0] } })
    ).toThrow(/No grader for free_answer/)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('records nothing for an invalid answer', () => {
    const { quiz, q0 } = seed()
    const { round } = service.startRound(quiz.id)

    expect(() =>
      service.submitAnswer(round.id, { questionId: q0, answer: { selected: [9] } })
    ).toThrow(/Unknown choice 9/)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('refuses an unknown or completed round', () => {
    const { quiz, q0, q1 } = seed()
    const { round } = service.startRound(quiz.id)
    service.completeRound(round.id, [
      { questionId: q0, answer: { selected: [1] } },
      { questionId: q1, answer: { selected: [0, 2] } }
    ])

    expect(() => service.submitAnswer(999, { questionId: q0, answer: { selected: [1] } })).toThrow(
      /Round 999 does not exist/
    )
    expect(() =>
      service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    ).toThrow(/already completed/)
    expect(() => service.completeRound(round.id)).toThrow(/already completed/)
  })
})

describe('completeRound', () => {
  it('scores the round, compares it with the Mastery Threshold and returns per-notion scores', () => {
    const { quiz, q0, q1, q2, a, b } = seed()
    const { round } = service.startRound(quiz.id)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    service.submitAnswer(round.id, { questionId: q1, answer: { selected: [0] } })

    const result = service.completeRound(round.id)

    expect(result.round).toMatchObject({ number: 1, scorePercent: 50, passed: false })
    expect(result.round.completedAt).not.toBeNull()
    expect(result.masteryThreshold).toBe(100)
    expect(result.questions.map((q) => [q.questionId, q.result])).toEqual([
      [q0, 'correct'],
      [q1, 'partially_correct']
    ])
    expect(result.notionScores).toEqual([
      {
        id: a.id,
        slug: 'a',
        title: 'Notion A',
        questionCount: 2,
        earned: 1,
        scorePercent: 50,
        missed: true
      },
      {
        id: b.id,
        slug: 'b',
        title: 'Notion B',
        questionCount: 1,
        earned: 0,
        scorePercent: 0,
        missed: true
      }
    ])
    expect(result.skippedQuestionIds).toEqual([q2])
    expect(getRound(db, round.id)).toMatchObject({ scorePercent: 50, passed: false })
    expect(service.getRoundResult(round.id)).toEqual(result)
  })

  it('passes against a lower threshold, and submits the whole quiz at once', () => {
    const { quiz, q0, q1 } = seed()
    updateSettings(db, { masteryThreshold: 50 })
    const { round } = service.startRound(quiz.id)

    const result = service.completeRound(round.id, [
      { questionId: q0, answer: { selected: [1] } },
      { questionId: q1, answer: { selected: [1] } }
    ])

    expect(result.round).toMatchObject({ scorePercent: 50, passed: true })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(2)
  })

  it('refuses a round with unanswered questions, and rolls back the answers given with it', () => {
    const { quiz, q0, q1 } = seed()
    const { round } = service.startRound(quiz.id)

    expect(() =>
      service.completeRound(round.id, [{ questionId: q0, answer: { selected: [1] } }])
    ).toThrow(new RegExp(`1 unanswered question\\(s\\): ${q1}`))
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
    expect(getRound(db, round.id)!.completedAt).toBeNull()
  })

  it('refuses a round with nothing to grade', () => {
    const { topic } = seed()
    const empty = createQuiz(db, { topicId: topic.id, grounded: false, questions: [] })
    const { round } = service.startRound(empty.id)

    expect(() => service.completeRound(round.id)).toThrow(/nothing to grade/)
  })

  it('refuses the result of an open round', () => {
    const { quiz } = seed()
    const { round } = service.startRound(quiz.id)

    expect(() => service.getRoundResult(round.id)).toThrow(/not completed/)
  })
})

describe('listing', () => {
  it('lists topics with their quiz count and quizzes with their question counts', () => {
    const { topic, quiz } = seed()

    expect(service.listTopics()).toEqual([
      { id: topic.id, slug: 'cache', title: 'Cache', quizCount: 1 }
    ])
    expect(service.listQuizzes(topic.id)).toEqual([
      {
        id: quiz.id,
        topicId: topic.id,
        createdAt: quiz.createdAt,
        grounded: true,
        questionCount: 3,
        gradableQuestionCount: 2
      }
    ])
  })
})

describe('createDevQuiz', () => {
  it('creates a playable fixture quiz on its own topic, reusing it', () => {
    const first = createDevQuiz(db)
    const second = createDevQuiz(db)

    const view = service.loadQuiz(first)
    expect(view.questions.map((q) => q.type)).toEqual([
      'single_choice',
      'multiple_choice',
      'scenario',
      'free_answer'
    ])
    expect(service.listTopics()).toEqual([
      expect.objectContaining({ slug: DEV_QUIZ_TOPIC_SLUG, quizCount: 2 })
    ])
    expect(service.loadQuiz(second).topicId).toBe(view.topicId)
    const { round } = service.startRound(first)
    const result = service.completeRound(round.id, [
      { questionId: view.questions[0]!.id, answer: { selected: [1] } },
      { questionId: view.questions[1]!.id, answer: { selected: [0, 1, 3] } },
      { questionId: view.questions[2]!.id, answer: { selected: [1] } }
    ])
    expect(result.round).toMatchObject({ scorePercent: 100, passed: true })
  })
})
