// The "I don't understand the question" button (#53), rendered with react-dom/server (no DOM, so
// no IPC): present on every question type, next to the question, never hiding the choices.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { QuestionFeedback, QuestionType, QuestionView, RoundStart } from '../../../shared/quiz'
import { ClarifyQuestion } from './ClarifyQuestion'
import { QuizPlayer } from './QuizPlayer'

const types: QuestionType[] = ['single_choice', 'multiple_choice', 'scenario', 'free_answer']

const questions: QuestionView[] = types.map((type, position) => ({
  id: position + 1,
  position,
  type,
  prompt: `Question ${type} ?`,
  scenario: type === 'scenario' ? 'Une situation.' : null,
  diagram: null,
  choices: type === 'free_answer' ? [] : ['Choix A', 'Choix B'],
  notions: [],
  gradable: true
}))

/** Renders the player on the question of `type`: the earlier ones count as answered. */
function renderQuestion(type: QuestionType): string {
  const index = types.indexOf(type)
  const start: RoundStart = {
    round: {
      id: 1,
      topicId: 1,
      quizId: 1,
      number: 1,
      startedAt: '2026-10-14T10:00:00.000Z',
      completedAt: null,
      scorePercent: null,
      passed: null
    },
    quiz: { id: 1, topicId: 1, topicTitle: 'Cache', grounded: true, questions },
    answered: questions.slice(0, index).map((q) => ({ questionId: q.id }) as QuestionFeedback)
  }
  return renderToStaticMarkup(createElement(QuizPlayer, { start, onCompleted: () => {} }))
}

describe('the clarification button', () => {
  it.each(types)(
    'is offered on a %s question, with the question and its choices still shown',
    (type) => {
      const html = renderQuestion(type)

      expect(html).toContain(`Question ${type} ?`)
      expect(html.match(/data-testid="clarify-question"/g)).toHaveLength(1)
      expect(html).toContain('I don’t understand the question')
      if (type === 'free_answer') {
        expect(html).toContain('data-testid="free-answer-text"')
      } else {
        expect(html).toContain('Choix A')
        expect(html).toContain('Choix B')
        // The button sits between the question and the choices.
        expect(html.indexOf(`Question ${type} ?`)).toBeLessThan(html.indexOf('clarify-question'))
        expect(html.indexOf('clarify-question')).toBeLessThan(html.indexOf('Choix A'))
      }
    }
  )

  it('shows nothing but the button before it is pressed', () => {
    const html = renderToStaticMarkup(createElement(ClarifyQuestion, { roundId: 1, questionId: 1 }))

    expect(html).toContain('clarify-question')
    expect(html).not.toContain('clarification')
    expect(html).not.toContain('clarify-pending')
    expect(html).not.toContain('clarify-error')
  })
})
