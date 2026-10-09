import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FreeAnswerGradingRequest } from '../generation/prompts/freeAnswerGrading'
import { GenerationError } from '../generation/errors'
import type { FreeAnswerGrading, QuestionFeedback } from '../../shared/quiz'
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
import type { FreeAnswerGrader } from './freeAnswerGrader'
import { localGraders, parseGradingRecord } from './grading'
import { createQuizService, type QuizService } from './service'

/**
 * Fake free-answer grader: the verdict comes from the answer text ("bon", "partiel", anything
 * else is incorrect). `next` overrides the next call (a failure, or a call held until released).
 */
function fakeGrader() {
  const requests: FreeAnswerGradingRequest[] = []
  let next: ((request: FreeAnswerGradingRequest, signal?: AbortSignal) => Promise<void>) | null =
    null
  const grading = (request: FreeAnswerGradingRequest): FreeAnswerGrading => {
    const text = request.contest ? 'bon' : request.answer
    const verdict = text.includes('bon')
      ? 'correct'
      : text.includes('partiel')
        ? 'partially_correct'
        : 'incorrect'
    return {
      verdict,
      expectedPoints: request.question.expectedPoints.map((_, index) => ({
        covered: verdict === 'correct' || (verdict === 'partially_correct' && index === 0),
        justification: `Point ${index + 1}`
      })),
      misconceptions: verdict === 'incorrect' ? ['Confusion'] : [],
      explanation: `Verdict ${verdict}`,
      toReview: verdict === 'correct' ? [] : ['Revoir le TTL']
    }
  }
  const grader: FreeAnswerGrader = {
    async grade(request, signal) {
      requests.push(request)
      const override = next
      next = null
      if (override) await override(request, signal)
      return { grading: grading(request), promptVersion: 'test-1' }
    }
  }
  return {
    grader,
    requests,
    failNext(code: GenerationError['code']) {
      next = async () => {
        throw new GenerationError(code)
      }
    },
    /** Holds the next call until the returned function is called, or its signal aborts. */
    holdNext(): () => void {
      let release!: () => void
      const released = new Promise<void>((resolve) => (release = resolve))
      next = (_request, signal) =>
        new Promise<void>((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
          void released.then(resolve)
        })
      return () => release()
    }
  }
}

let db: Database
let service: QuizService
let grader: ReturnType<typeof fakeGrader>

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  grader = fakeGrader()
  service = createQuizService(db, localGraders, { freeAnswerGrader: grader.grader })
})

afterEach(() => db.close())

const choices = (...correct: boolean[]) =>
  correct.map((isCorrect, index) => ({ text: `Choix ${index}`, correct: isCorrect }))

const free = (text: string) => ({ text })

/** Narrows a feedback to the free-answer kind. */
function freeFeedback(feedback: QuestionFeedback) {
  if (feedback.kind !== 'free_answer') throw new Error('Not a free-answer feedback.')
  return feedback
}

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
        body: {
          expectedPoints: ['Point attendu 1', 'Point attendu 2'],
          modelAnswer: 'Réponse modèle',
          sourceSections: []
        },
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
      ['free_answer', true]
    ])
    expect(view.questions[1]!.choices).toEqual(['Choix 0', 'Choix 1', 'Choix 2', 'Choix 3'])
    expect(view.questions[1]!.notions.map((n) => n.id)).toEqual([a.id, b.id])
    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('correct')
    expect(serialized).not.toContain('E0')
    expect(serialized).not.toContain('modelAnswer')
    expect(serialized).not.toContain('Réponse modèle')
    expect(serialized).not.toContain('Point attendu')
  })

  it('throws on an unknown quiz', () => {
    expect(() => service.loadQuiz(42)).toThrow(/Quiz 42 does not exist/)
  })
})

describe('rounds', () => {
  it('numbers rounds per topic, never restarting, across quizzes', async () => {
    const { topic, quiz, q0, q1, q2 } = seed()
    const first = service.startRound(quiz.id).round
    await service.submitFreeAnswer(first.id, { questionId: q2, answer: free('bon') })
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
    const [answered] = resumed.answered
    if (answered?.kind !== 'choice') throw new Error('Expected a choice feedback.')
    expect(answered.choices[1]).toEqual({
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

  it('refuses a question of another quiz, a replaced one, and a free answer (async path)', () => {
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
    ).toThrow(/graded by a Generation/)
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

  it('refuses an unknown or completed round', async () => {
    const { quiz, q0, q1, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
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
    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
    ).rejects.toThrow(/already completed/)
    await expect(service.contestGrade(round.id, q2, 'Pourquoi ?')).rejects.toThrow(
      /already completed/
    )
  })
})

describe('completeRound', () => {
  it('scores the round with its free answer, against the Mastery Threshold, per notion', async () => {
    const { quiz, q0, q1, q2, a, b } = seed()
    const { round } = service.startRound(quiz.id)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    service.submitAnswer(round.id, { questionId: q1, answer: { selected: [0] } })
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('partiel') })

    const result = service.completeRound(round.id)

    expect(result.round.scorePercent).toBeCloseTo(33.333, 3)
    expect(result.round).toMatchObject({ number: 1, passed: false })
    expect(result.round.completedAt).not.toBeNull()
    expect(result.masteryThreshold).toBe(100)
    expect(result.questions.map((q) => [q.questionId, q.result, q.score])).toEqual([
      [q0, 'correct', 1],
      [q1, 'partially_correct', 0],
      [q2, 'partially_correct', 0]
    ])
    expect(freeFeedback(result.questions[2]!)).toMatchObject({
      partialCredit: 0.5,
      modelAnswer: 'Réponse modèle',
      contestable: false
    })
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
        questionCount: 2,
        earned: 0,
        scorePercent: 0,
        missed: true
      }
    ])
    expect(result.skippedQuestionIds).toEqual([])
    expect(getRound(db, round.id)!.scorePercent).toBeCloseTo(33.333, 3)
    expect(service.getRoundResult(round.id)).toEqual(result)
  })

  it('passes against a lower threshold, and submits the choice answers at once', async () => {
    const { quiz, q0, q1, q2 } = seed()
    updateSettings(db, { masteryThreshold: 60 })
    const { round } = service.startRound(quiz.id)
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })

    const result = service.completeRound(round.id, [
      { questionId: q0, answer: { selected: [1] } },
      { questionId: q1, answer: { selected: [1] } }
    ])

    expect(result.round.scorePercent).toBeCloseTo(66.667, 3)
    expect(result.round.passed).toBe(true)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(3)
  })

  it('refuses a free answer given with completeRound: it is graded by a Generation', () => {
    const { quiz, q0, q1, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    expect(() =>
      service.completeRound(round.id, [
        { questionId: q0, answer: { selected: [1] } },
        { questionId: q1, answer: { selected: [0, 2] } },
        { questionId: q2, answer: free('bon') }
      ])
    ).toThrow(/graded by a Generation/)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('refuses a round with unanswered questions, and rolls back the answers given with it', () => {
    const { quiz, q0, q1, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    expect(() =>
      service.completeRound(round.id, [{ questionId: q0, answer: { selected: [1] } }])
    ).toThrow(new RegExp(`2 unanswered question\\(s\\): ${q1}, ${q2}`))
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
        gradableQuestionCount: 3
      }
    ])
  })
})

describe('createDevQuiz', () => {
  it('creates a playable fixture quiz on its own topic, reusing it', async () => {
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
    await service.submitFreeAnswer(round.id, {
      questionId: view.questions[3]!.id,
      answer: free('Un bon TTL limite les données périmées.')
    })
    const result = service.completeRound(round.id, [
      { questionId: view.questions[0]!.id, answer: { selected: [1] } },
      { questionId: view.questions[1]!.id, answer: { selected: [0, 1, 3] } },
      { questionId: view.questions[2]!.id, answer: { selected: [1] } }
    ])
    expect(result.round).toMatchObject({ scorePercent: 100, passed: true })
  })
})

describe('submitFreeAnswer', () => {
  it('grades through the grader, then records the Attempt with its grading record', async () => {
    const { quiz, q2, b } = seed()
    const { round } = service.startRound(quiz.id)

    const feedback = freeFeedback(
      await service.submitFreeAnswer(round.id, {
        questionId: q2,
        answer: free('  Une réponse partielle.  ')
      })
    )

    expect(grader.requests).toEqual([
      {
        question: {
          prompt: 'Q2',
          expectedPoints: ['Point attendu 1', 'Point attendu 2'],
          modelAnswer: 'Réponse modèle'
        },
        notions: [{ slug: 'b', title: 'Notion B', description: null }],
        answer: 'Une réponse partielle.'
      }
    ])
    expect(feedback).toMatchObject({
      kind: 'free_answer',
      result: 'partially_correct',
      score: 0,
      partialCredit: 0.5,
      answer: 'Une réponse partielle.',
      expectedPoints: [
        { point: 'Point attendu 1', covered: true, justification: 'Point 1' },
        { point: 'Point attendu 2', covered: false, justification: 'Point 2' }
      ],
      explanation: 'Verdict partially_correct',
      toReview: ['Revoir le TTL'],
      modelAnswer: 'Réponse modèle',
      contest: null,
      contestable: true
    })
    const [attempt] = listAttemptsByRound(db, round.id)
    expect(attempt).toMatchObject({
      questionId: q2,
      questionType: 'free_answer',
      answer: { text: 'Une réponse partielle.' },
      result: 'partially_correct',
      score: 0,
      notionIds: [b.id]
    })
    expect(parseGradingRecord(attempt!.feedback)).toMatchObject({
      promptVersion: 'test-1',
      grading: { verdict: 'partially_correct' },
      contest: null,
      history: []
    })
  })

  it('scores only a correct verdict', async () => {
    const { quiz, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    const feedback = await service.submitFreeAnswer(round.id, {
      questionId: q2,
      answer: free('Une bonne réponse.')
    })

    expect(feedback).toMatchObject({ result: 'correct', score: 1, partialCredit: 1 })
    expect(freeFeedback(feedback).contestable).toBe(false)
  })

  it('records nothing when the grading fails, and can be retried', async () => {
    const { quiz, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    grader.failNext('not_logged_in')

    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
    ).rejects.toMatchObject({ code: 'not_logged_in' })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)

    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(1)
  })

  it('records nothing when cancelled', async () => {
    const { quiz, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    grader.holdNext()
    const controller = new AbortController()

    const pending = service.submitFreeAnswer(
      round.id,
      { questionId: q2, answer: free('bon') },
      controller.signal
    )
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(listAttemptsByRound(db, round.id)).toHaveLength(0)
  })

  it('refuses a double submission while grading, and once answered', async () => {
    const { quiz, q0, q1, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    const release = grader.holdNext()

    const first = service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('bon') })
    ).rejects.toThrow(/already being graded/)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    service.submitAnswer(round.id, { questionId: q1, answer: { selected: [0, 2] } })
    expect(() => service.completeRound(round.id)).toThrow(/an answer being graded/)
    release()
    await first

    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('autre') })
    ).rejects.toThrow(/already answered/)
    expect(grader.requests).toHaveLength(1)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(3)
    expect(service.completeRound(round.id).round).toMatchObject({ scorePercent: 100 })
  })

  it('refuses an empty, too long or choice-shaped answer before any Generation', async () => {
    const { quiz, q0, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('   ') })
    ).rejects.toThrow(/Write an answer first/)
    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: free('x'.repeat(1201)) })
    ).rejects.toThrow(/at most 1200 characters/)
    await expect(
      service.submitFreeAnswer(round.id, { questionId: q2, answer: { selected: [0] } })
    ).rejects.toThrow(/must be \{ text: string \}/)
    await expect(
      service.submitFreeAnswer(round.id, { questionId: q0, answer: free('bon') })
    ).rejects.toThrow(/not a free-answer question/)
    expect(grader.requests).toHaveLength(0)
  })
})

describe('contestGrade', () => {
  it('re-grades once with the justification and keeps the first grading in the history', async () => {
    const { quiz, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('Le TTL expire.') })

    const feedback = freeFeedback(
      await service.contestGrade(round.id, q2, '  J’ai bien parlé de l’expiration.  ')
    )

    expect(grader.requests[1]).toMatchObject({
      answer: 'Le TTL expire.',
      contest: {
        justification: 'J’ai bien parlé de l’expiration.',
        previous: { verdict: 'incorrect' }
      }
    })
    expect(feedback).toMatchObject({
      result: 'correct',
      score: 1,
      contestable: false,
      contest: {
        justification: 'J’ai bien parlé de l’expiration.',
        previous: { result: 'incorrect', explanation: 'Verdict incorrect' }
      }
    })
    const [attempt] = listAttemptsByRound(db, round.id)
    expect(attempt).toMatchObject({ result: 'correct', score: 1 })
    const record = parseGradingRecord(attempt!.feedback)
    expect(record.contest?.justification).toBe('J’ai bien parlé de l’expiration.')
    expect(record.history).toEqual([
      { promptVersion: 'test-1', grading: expect.objectContaining({ verdict: 'incorrect' }) }
    ])
    expect(freeFeedback(service.startRound(quiz.id).answered[0]!)).toMatchObject({
      result: 'correct',
      contestable: false
    })
  })

  it('refuses a second contest, a correct answer, an unanswered question and empty text', async () => {
    const { quiz, q0, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    await expect(service.contestGrade(round.id, q2, 'Pourquoi ?')).rejects.toThrow(
      /no graded free answer/
    )
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('faux') })
    await expect(service.contestGrade(round.id, q2, '  ')).rejects.toThrow(/Explain why/)
    await service.contestGrade(round.id, q2, 'Relis ma réponse.')
    await expect(service.contestGrade(round.id, q2, 'Encore.')).rejects.toThrow(/already contested/)
    service.submitAnswer(round.id, { questionId: q0, answer: { selected: [1] } })
    await expect(service.contestGrade(round.id, q0, 'Pourquoi ?')).rejects.toThrow(
      /no graded free answer/
    )

    const other = service.startRound(createQuizWithFreeAnswer()).round
    const otherQuestion = service.loadQuiz(other.quizId).questions[0]!.id
    await service.submitFreeAnswer(other.id, { questionId: otherQuestion, answer: free('bon') })
    await expect(service.contestGrade(other.id, otherQuestion, 'Merci')).rejects.toThrow(
      /correct answer cannot be contested/
    )
    expect(grader.requests).toHaveLength(3)
  })

  it('keeps the first grading when the re-grade fails, and can be retried', async () => {
    const { quiz, q2 } = seed()
    const { round } = service.startRound(quiz.id)
    await service.submitFreeAnswer(round.id, { questionId: q2, answer: free('faux') })
    grader.failNext('quota_or_rate_limit')

    await expect(service.contestGrade(round.id, q2, 'Relis.')).rejects.toMatchObject({
      code: 'quota_or_rate_limit'
    })
    const record = parseGradingRecord(listAttemptsByRound(db, round.id)[0]!.feedback)
    expect(record).toMatchObject({ grading: { verdict: 'incorrect' }, contest: null })

    await expect(service.contestGrade(round.id, q2, 'Relis.')).resolves.toMatchObject({
      result: 'correct'
    })
  })
})

describe('without a free-answer grader', () => {
  it('leaves free answers out of the round and its score', () => {
    service = createQuizService(db)
    const { quiz, q0, q1, q2 } = seed()
    const { round } = service.startRound(quiz.id)

    expect(service.loadQuiz(quiz.id).questions[2]!.gradable).toBe(false)
    const result = service.completeRound(round.id, [
      { questionId: q0, answer: { selected: [1] } },
      { questionId: q1, answer: { selected: [0, 2] } }
    ])

    expect(result.round).toMatchObject({ scorePercent: 100, passed: true })
    expect(result.skippedQuestionIds).toEqual([q2])
  })
})

/** A second quiz on a new topic with a single free-answer question. */
function createQuizWithFreeAnswer(): number {
  const topic = createTopic(db, { slug: 'dns', title: 'DNS', position: 1 })
  return createQuiz(db, {
    topicId: topic.id,
    grounded: false,
    questions: [
      {
        position: 0,
        type: 'free_answer',
        prompt: 'Q DNS',
        body: { expectedPoints: ['p'], modelAnswer: 'm' },
        notionIds: []
      }
    ]
  }).id
}
