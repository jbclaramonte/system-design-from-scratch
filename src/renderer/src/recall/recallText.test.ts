import { describe, expect, it } from 'vitest'
import {
  notionOutcomeMark,
  oftenMissedText,
  progressText,
  scoreSummaryText,
  subtitleText
} from './recallText'

describe('oftenMissedText', () => {
  it('gives the plain count of misses among the latest quizzes', () => {
    expect(oftenMissedText(3, 4)).toBe('You missed this notion in 3 of your last 4 quizzes')
    expect(oftenMissedText(2, 6)).toBe('You missed this notion in 2 of your last 6 quizzes')
  })

  it('uses the singular when only one quiz is counted', () => {
    expect(oftenMissedText(1, 1)).toBe('You missed this notion in 1 of your last 1 quiz')
  })
})

describe('progressText', () => {
  it('names the 1-based position of the question', () => {
    expect(progressText(3, 6)).toBe('Question 3 of 6')
    expect(progressText(1, 1)).toBe('Question 1 of 1')
  })
})

describe('subtitleText', () => {
  it('says the quiz covers earlier lessons, not the one about to open', () => {
    expect(subtitleText()).toBe('A quick check on your earlier lessons')
  })
})

describe('scoreSummaryText', () => {
  it('counts the correct answers without any verdict', () => {
    expect(scoreSummaryText(4, 6)).toBe('You answered 4 of 6 questions correctly.')
    expect(scoreSummaryText(1, 1)).toBe('You answered 1 of 1 question correctly.')
    expect(scoreSummaryText(0, 5)).toBe('You answered 0 of 5 questions correctly.')
  })
})

describe('notionOutcomeMark', () => {
  it('pairs a glyph and a word for every outcome, never a color alone', () => {
    expect(notionOutcomeMark(3, 3)).toEqual({ glyph: '✓', label: 'All correct', tone: 'mastered' })
    expect(notionOutcomeMark(1, 2)).toEqual({ glyph: '!', label: 'Some missed', tone: 'attention' })
    expect(notionOutcomeMark(0, 2)).toEqual({ glyph: '!', label: 'Missed', tone: 'attention' })
  })

  it('never uses pass or fail wording', () => {
    for (const [correct, asked] of [
      [0, 1],
      [1, 2],
      [2, 2]
    ]) {
      expect(notionOutcomeMark(correct, asked).label).not.toMatch(/pass|fail|wrong|incorrect/i)
    }
  })
})
