import { describe, expect, it } from 'vitest'
import type { Json } from '../../shared/json'
import type { FreeAnswerGrading, FreeAnswerGradingRecord, QuestionType } from '../../shared/quiz'
import {
  coveredShare,
  freeAnswerFeedback,
  gradeAnswer,
  InvalidAnswerError,
  meetsThreshold,
  normalizeChoiceAnswer,
  normalizeFreeAnswer,
  notionScores,
  parseGradingRecord,
  quizScorePercent,
  recordGradingResult,
  verdictScore,
  type GradableQuestion
} from './grading'

const choices = (...correct: boolean[]) =>
  correct.map((isCorrect, index) => ({ text: `Choix ${index}`, correct: isCorrect }))

const question = (type: QuestionType, body: Json): GradableQuestion => ({
  id: 7,
  type,
  prompt: 'Question ?',
  body
})

const single = question('single_choice', {
  choices: choices(false, true, false),
  explanation: 'Parce que.',
  sourceSections: []
})
const scenario = question('scenario', {
  scenario: 'Un site très lu.',
  choices: choices(true, false, false),
  explanation: 'Le compromis.'
})
// Correct choices: 0, 1, 3.
const multiple = question('multiple_choice', {
  choices: choices(true, true, false, true),
  explanation: 'Trois bonnes réponses.'
})

describe('normalizeChoiceAnswer', () => {
  it('sorts and collapses duplicate selections', () => {
    expect(normalizeChoiceAnswer({ selected: [2, 0, 2, 0] }, 3)).toEqual({ selected: [0, 2] })
  })

  it.each([
    [{ selected: [3] }, /Unknown choice 3/],
    [{ selected: [-1] }, /Unknown choice -1/],
    [{ selected: [0.5] }, /Unknown choice 0.5/],
    [{ selected: [] }, /at least one/],
    [{ selected: ['0'] }, /selected: number/],
    [[0], /selected: number/],
    [null, /selected: number/]
  ])('rejects %j', (answer, message) => {
    expect(() => normalizeChoiceAnswer(answer, 3)).toThrow(message)
    expect(() => normalizeChoiceAnswer(answer, 3)).toThrow(InvalidAnswerError)
  })
})

describe('single choice and scenario', () => {
  it('grades the correct choice 1 and builds feedback from the stored explanation', () => {
    const { grading, answer, feedback } = gradeAnswer(single, { selected: [1] })

    expect(grading).toEqual({ result: 'correct', score: 1, feedback: null })
    expect(answer).toEqual({ selected: [1] })
    expect(feedback).toEqual({
      questionId: 7,
      type: 'single_choice',
      prompt: 'Question ?',
      kind: 'choice',
      result: 'correct',
      score: 1,
      feedback: null,
      choices: [
        { text: 'Choix 0', correct: false, selected: false },
        { text: 'Choix 1', correct: true, selected: true },
        { text: 'Choix 2', correct: false, selected: false }
      ],
      scenario: null,
      explanation: 'Parce que.',
      partialCredit: null
    })
  })

  it('grades a wrong choice 0', () => {
    expect(gradeAnswer(single, { selected: [2] }).grading).toEqual({
      result: 'incorrect',
      score: 0,
      feedback: null
    })
  })

  it('accepts a duplicated single selection', () => {
    expect(gradeAnswer(single, { selected: [1, 1] }).grading.score).toBe(1)
  })

  it('refuses several choices', () => {
    expect(() => gradeAnswer(single, { selected: [0, 1] })).toThrow(/exactly one choice/)
    expect(() => gradeAnswer(scenario, { selected: [0, 1] })).toThrow(InvalidAnswerError)
  })

  it('grades a scenario like a single choice and shows its situation with the trade-off', () => {
    const { grading, feedback } = gradeAnswer(scenario, { selected: [0] })

    expect(grading.result).toBe('correct')
    expect(feedback.scenario).toBe('Un site très lu.')
    expect(feedback.explanation).toBe('Le compromis.')
    expect(feedback.type).toBe('scenario')
  })
})

describe('multiple choice', () => {
  const grade = (selected: number[]) => gradeAnswer(multiple, { selected })

  it('is correct only for the exact set of correct choices, whatever the order', () => {
    const { grading, feedback } = grade([3, 0, 1])

    expect(grading).toEqual({ result: 'correct', score: 1, feedback: null })
    expect(feedback.partialCredit).toBe(1)
  })

  it('scores a missing correct choice 0 (all-or-nothing), partially correct', () => {
    const { grading, feedback } = grade([0, 1])

    expect(grading).toEqual({ result: 'partially_correct', score: 0, feedback: null })
    expect(feedback.partialCredit).toBeCloseTo(2 / 3)
  })

  it('scores an over-selection 0, partially correct, with the wrong pick deducted', () => {
    const { grading, feedback } = grade([0, 1, 2, 3])

    expect(grading.result).toBe('partially_correct')
    expect(grading.score).toBe(0)
    expect(feedback.partialCredit).toBeCloseTo(2 / 3)
  })

  it('floors the partial credit at 0', () => {
    const { grading, feedback } = grade([0, 2])

    expect(grading.result).toBe('partially_correct')
    expect(feedback.partialCredit).toBe(0)
  })

  it('is incorrect when no correct choice is picked', () => {
    const { grading, feedback } = grade([2])

    expect(grading).toEqual({ result: 'incorrect', score: 0, feedback: null })
    expect(feedback.partialCredit).toBe(0)
  })

  it('collapses duplicate selections before grading', () => {
    expect(grade([0, 0, 1, 1, 3]).grading.result).toBe('correct')
    expect(grade([0, 0, 1, 1, 3]).answer).toEqual({ selected: [0, 1, 3] })
  })

  it('rejects unknown choices', () => {
    expect(() => grade([0, 1, 3, 4])).toThrow(/Unknown choice 4/)
  })

  it('marks every choice with selected and correct in the feedback', () => {
    expect(
      grade([1, 2]).feedback.choices.map(({ correct, selected }) => [correct, selected])
    ).toEqual([
      [true, false],
      [true, true],
      [false, true],
      [true, false]
    ])
  })
})

describe('gradeAnswer', () => {
  it('has no local grader for free answers: they are graded by a Generation', () => {
    const free = question('free_answer', { expectedPoints: ['x'], modelAnswer: 'y' })

    expect(() => gradeAnswer(free, { text: 'z' })).toThrow(/graded by a Generation/)
  })

  it('uses an injected grader (the extension point for free answers)', () => {
    const free = question('free_answer', { expectedPoints: ['x'], modelAnswer: 'y' })
    const graded = gradeAnswer(
      free,
      {},
      {
        free_answer: {
          grade: () => ({
            grading: { result: 'partially_correct', score: 0.5, feedback: 'Presque.' },
            answer: {},
            feedback: {} as never
          })
        }
      }
    )

    expect(graded.grading.score).toBe(0.5)
  })

  it('rejects a malformed stored body', () => {
    expect(() =>
      gradeAnswer(question('single_choice', { choices: [] }), { selected: [0] })
    ).toThrow()
  })
})

describe('free answers', () => {
  const free = question('free_answer', {
    expectedPoints: ['Expiration', 'Données périmées'],
    modelAnswer: 'Le TTL fait expirer l’entrée.',
    sourceSections: []
  })
  const grading = (verdict: FreeAnswerGrading['verdict'], covered: boolean[]) => ({
    verdict,
    expectedPoints: covered.map((isCovered, index) => ({
      covered: isCovered,
      justification: `J${index}`
    })),
    misconceptions: [],
    explanation: `Explication ${verdict}`,
    toReview: []
  })

  it('normalizes a free answer: trimmed, not empty, bounded', () => {
    expect(normalizeFreeAnswer({ text: '  Le TTL.  ' })).toEqual({ text: 'Le TTL.' })
    expect(() => normalizeFreeAnswer({ text: ' \n ' })).toThrow(InvalidAnswerError)
    expect(() => normalizeFreeAnswer({ text: 'x'.repeat(1201) })).toThrow(/1200 characters/)
    expect(normalizeFreeAnswer({ text: 'x'.repeat(1200) }).text).toHaveLength(1200)
    expect(() => normalizeFreeAnswer({ selected: [0] })).toThrow(InvalidAnswerError)
  })

  it('maps a verdict to an all-or-nothing score, like multiple choice', () => {
    expect(verdictScore('correct')).toBe(1)
    expect(verdictScore('partially_correct')).toBe(0)
    expect(verdictScore('incorrect')).toBe(0)
    expect(coveredShare(grading('partially_correct', [true, false]))).toBe(0.5)
    expect(coveredShare(grading('incorrect', []))).toBe(0)
  })

  it('stores the grading record as JSON and reads it back', () => {
    const record: FreeAnswerGradingRecord = {
      promptVersion: 'v1',
      grading: grading('partially_correct', [true, false]),
      contest: null,
      history: []
    }

    const stored = recordGradingResult(record)

    expect(stored).toMatchObject({ result: 'partially_correct', score: 0 })
    expect(parseGradingRecord(stored.feedback)).toEqual(record)
    expect(() => parseGradingRecord(null)).toThrow(/no grading/)
    expect(() => parseGradingRecord('{"grading": {}}')).toThrow()
  })

  it('builds the feedback with the expected points, the model answer and the contest', () => {
    const record: FreeAnswerGradingRecord = {
      promptVersion: 'v2',
      grading: grading('partially_correct', [true, false]),
      contest: { justification: 'Relis.', contestedAt: '2026-01-01T00:00:00.000Z' },
      history: [{ promptVersion: 'v1', grading: grading('incorrect', [false, false]) }]
    }

    const feedback = freeAnswerFeedback(free, 'Ma réponse', record, { contestable: true })

    expect(feedback).toMatchObject({
      kind: 'free_answer',
      result: 'partially_correct',
      score: 0,
      feedback: 'Explication partially_correct',
      partialCredit: 0.5,
      answer: 'Ma réponse',
      expectedPoints: [
        { point: 'Expiration', covered: true, justification: 'J0' },
        { point: 'Données périmées', covered: false, justification: 'J1' }
      ],
      modelAnswer: 'Le TTL fait expirer l’entrée.',
      contest: { justification: 'Relis.', previous: { result: 'incorrect' } },
      // Already contested.
      contestable: false
    })
    expect(
      freeAnswerFeedback(
        free,
        'x',
        { ...record, contest: null, history: [] },
        { contestable: true }
      ).contestable
    ).toBe(true)
    expect(
      freeAnswerFeedback(
        free,
        'x',
        { ...record, grading: grading('correct', [true, true]), contest: null },
        { contestable: true }
      ).contestable
    ).toBe(false)
  })
})

describe('scores', () => {
  const notions = [
    { id: 1, slug: 'a', title: 'A' },
    { id: 2, slug: 'b', title: 'B' },
    { id: 3, slug: 'c', title: 'C' }
  ]

  it('computes the quiz score in percent, exactly', () => {
    expect(quizScorePercent([{ score: 1, notionIds: [] }])).toBe(100)
    expect(
      quizScorePercent([
        { score: 1, notionIds: [] },
        { score: 0, notionIds: [] },
        { score: 0, notionIds: [] }
      ])
    ).toBeCloseTo(33.333, 3)
    const hundred = Array.from({ length: 100 }, (_, i) => ({
      score: i < 29 ? 1 : 0,
      notionIds: []
    }))
    expect(quizScorePercent(hundred)).toBe(29)
  })

  it('refuses an empty quiz', () => {
    expect(() => quizScorePercent([])).toThrow(/at least one/)
  })

  it('counts a question tagged with several notions for each of them', () => {
    const scores = notionScores(
      [
        { score: 1, notionIds: [1, 2] },
        { score: 0, notionIds: [2] },
        { score: 1, notionIds: [1] }
      ],
      notions
    )

    expect(scores).toEqual([
      { ...notions[0], questionCount: 2, earned: 2, scorePercent: 100, missed: false },
      { ...notions[1], questionCount: 2, earned: 1, scorePercent: 50, missed: true }
    ])
  })

  it('compares with the Mastery Threshold inclusively', () => {
    expect(meetsThreshold(100, 100)).toBe(true)
    expect(meetsThreshold(80, 80)).toBe(true)
    expect(meetsThreshold(99.9, 100)).toBe(false)
  })
})
