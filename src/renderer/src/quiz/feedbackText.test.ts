import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChoiceQuestionFeedback } from '../../../shared/quiz'
import {
  choiceFeedbackMessage,
  choiceTally,
  feedbackLine,
  freeAnswerFeedbackMessage
} from './feedbackText'
import { QuestionFeedbackView } from './QuestionFeedbackView'

const tally = (correctPicked: number, correctTotal: number, wrongPicked: number) => ({
  correctPicked,
  correctTotal,
  wrongPicked
})
const line = (correctPicked: number, correctTotal: number, wrongPicked: number) =>
  feedbackLine(choiceFeedbackMessage(tally(correctPicked, correctTotal, wrongPicked)))

describe('choiceFeedbackMessage', () => {
  it('says how many correct answers were missed, and why it still counts as missed', () => {
    expect(line(2, 3, 0)).toBe(
      'Not quite: you found 2 of the 3 correct answers. You need all of them, and none of the wrong ones, to validate this question.'
    )
  })

  it('names the wrong picks when every correct answer was found', () => {
    expect(line(3, 3, 1)).toBe(
      'Not quite: you found all 3 correct answers but also picked 1 wrong answer. You need all of them, and none of the wrong ones, to validate this question.'
    )
  })

  it('names both the missed correct answers and the wrong picks', () => {
    expect(line(1, 3, 2)).toBe(
      'Not quite: you found 1 of the 3 correct answers and picked 2 wrong answers. You need all of them, and none of the wrong ones, to validate this question.'
    )
  })

  it('is incorrect when no correct answer was found', () => {
    expect(line(0, 2, 2)).toBe(
      'Incorrect: you found none of the 2 correct answers and picked 2 wrong answers. The correct ones are marked below.'
    )
  })

  it('is correct when the selection is exact', () => {
    expect(line(3, 3, 0)).toBe('Correct: you found all 3 correct answers.')
    expect(line(2, 2, 0)).toBe('Correct: you found both correct answers.')
  })

  it('keeps single choice and scenario verdicts to the label', () => {
    expect(line(1, 1, 0)).toBe('Correct')
    expect(line(0, 1, 1)).toBe('Incorrect')
  })

  it('never reads "of the way" or "partially correct"', () => {
    for (const [picked, total, wrong] of [
      [2, 3, 0],
      [3, 3, 1],
      [1, 3, 2],
      [0, 3, 1]
    ] as const) {
      expect(line(picked, total, wrong)).not.toMatch(/of the way|partially correct|%/i)
    }
  })
})

describe('choiceTally', () => {
  it('counts the correct picks, the correct choices and the wrong picks', () => {
    expect(
      choiceTally([
        { text: 'A', correct: true, selected: true },
        { text: 'B', correct: true, selected: false },
        { text: 'C', correct: false, selected: true },
        { text: 'D', correct: false, selected: false }
      ])
    ).toEqual({ correctPicked: 1, correctTotal: 2, wrongPicked: 1 })
  })
})

describe('freeAnswerFeedbackMessage', () => {
  it('says how many expected points were covered for a partial answer', () => {
    expect(feedbackLine(freeAnswerFeedbackMessage('partially_correct', 2, 3))).toBe(
      'Not quite: you covered 2 of the 3 expected points. You need every expected point, without a major error, to validate this question.'
    )
  })

  it('keeps the label alone for a correct or incorrect answer', () => {
    expect(feedbackLine(freeAnswerFeedbackMessage('correct', 3, 3))).toBe('Correct')
    expect(feedbackLine(freeAnswerFeedbackMessage('incorrect', 0, 3))).toBe('Incorrect')
  })
})

describe('QuestionFeedbackView', () => {
  it('shows the plain verdict of a partial multiple choice (quiz player and results)', () => {
    const feedback: ChoiceQuestionFeedback = {
      kind: 'choice',
      questionId: 1,
      type: 'multiple_choice',
      prompt: 'Lesquels ?',
      result: 'partially_correct',
      score: 0,
      feedback: null,
      partialCredit: 0.5,
      choices: [
        { text: 'A', correct: true, selected: true },
        { text: 'B', correct: true, selected: false },
        { text: 'C', correct: false, selected: false }
      ],
      scenario: null,
      explanation: 'Parce que.'
    }
    const html = renderToStaticMarkup(createElement(QuestionFeedbackView, { feedback }))

    expect(html).toContain('Not quite')
    expect(html).toContain('you found 1 of the 2 correct answers.')
    expect(html).not.toMatch(/of the way|Partially correct/)
  })
})
