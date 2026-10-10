import { describe, expect, it } from 'vitest'
import type { QuestionView } from '../../../shared/quiz'
import {
  allGradableAnswered,
  answeredPercent,
  formatPercent,
  nextQuestionIndex,
  postponedQuestions,
  toggleChoice
} from './progress'

const question = (id: number, gradable = true): QuestionView => ({
  id,
  position: id,
  type: gradable ? 'single_choice' : 'free_answer',
  prompt: `Q${id}`,
  scenario: null,
  choices: [],
  notions: [],
  gradable
})

const questions = [question(1), question(2, false), question(3)]

describe('nextQuestionIndex', () => {
  it('returns the first question neither answered nor skipped', () => {
    expect(nextQuestionIndex(questions, new Set(), new Set())).toBe(0)
    expect(nextQuestionIndex(questions, new Set([1]), new Set())).toBe(1)
    expect(nextQuestionIndex(questions, new Set([1]), new Set([2]))).toBe(2)
    expect(nextQuestionIndex(questions, new Set([1, 3]), new Set([2]))).toBe(3)
  })
})

describe('allGradableAnswered', () => {
  it('ignores questions without a grader', () => {
    expect(allGradableAnswered(questions, new Set([1]))).toBe(false)
    expect(allGradableAnswered(questions, new Set([1, 3]))).toBe(true)
  })
})

describe('postponedQuestions', () => {
  it('lists the skipped gradable questions not answered yet', () => {
    const free = { ...question(4), type: 'free_answer' as const }
    const all = [...questions, free]

    expect(postponedQuestions(all, new Set([1]), new Set([2, 4])).map((q) => q.id)).toEqual([4])
    expect(postponedQuestions(all, new Set([1, 4]), new Set([2, 4]))).toEqual([])
  })
})

describe('toggleChoice', () => {
  it('replaces a single selection', () => {
    expect(toggleChoice([0], 2, false)).toEqual([2])
  })

  it('adds and removes multiple selections, sorted', () => {
    expect(toggleChoice([2], 0, true)).toEqual([0, 2])
    expect(toggleChoice([0, 2], 2, true)).toEqual([0])
  })
})

describe('formatPercent', () => {
  it('keeps whole numbers and rounds the others to one decimal', () => {
    expect(formatPercent(100)).toBe('100%')
    expect(formatPercent(200 / 3)).toBe('66.7%')
  })
})

describe('answeredPercent', () => {
  it('is the share of answered questions, rounded', () => {
    expect(answeredPercent(0, 4)).toBe(0)
    expect(answeredPercent(1, 3)).toBe(33)
    expect(answeredPercent(4, 4)).toBe(100)
  })

  it('is 0 with no question and never above 100', () => {
    expect(answeredPercent(0, 0)).toBe(0)
    expect(answeredPercent(5, 4)).toBe(100)
  })
})
