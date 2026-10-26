// The Recall Quiz screens, rendered with react-dom/server (no DOM, so no IPC): the structure the
// spec asks for, and what must never appear (skip, XP, pass or fail wording, a Mastery Threshold).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChoiceQuestionFeedback } from '../../../shared/quiz'
import type { RecallQuestionView, RecallResult, RecallStart } from '../../../shared/recall'
import { RecallPlayer } from './RecallPlayer'
import { RecallResults } from './RecallResults'

const notion = { id: 1, slug: 'cache', title: 'Cache-aside' }
const session = {
  id: 7,
  kind: 'gate' as const,
  topicId: 3,
  startedAt: '2026-10-26T10:00:00.000Z',
  completedAt: null
}

const question = (
  id: number,
  recallHint: RecallQuestionView['recallHint']
): RecallQuestionView => ({
  id,
  position: id - 1,
  type: 'single_choice',
  prompt: `Question ${id} ?`,
  scenario: null,
  diagram: null,
  choices: ['Choix A', 'Choix B'],
  notions: [notion],
  gradable: true,
  recallHint
})

const feedback = (id: number, result: ChoiceQuestionFeedback['result']): ChoiceQuestionFeedback =>
  ({
    kind: 'choice',
    questionId: id,
    type: 'single_choice',
    prompt: `Question ${id} ?`,
    result,
    choices: [
      { text: 'Choix A', selected: true, correct: result === 'correct' },
      { text: 'Choix B', selected: false, correct: result !== 'correct' }
    ],
    scenario: null,
    explanation: 'Parce que.'
  }) as ChoiceQuestionFeedback

const start = (answered: ChoiceQuestionFeedback[] = []): RecallStart => ({
  session,
  questions: [question(1, null), question(2, { missed: 3, of: 4 }), question(3, null)],
  answered
})

const play = (value: RecallStart) =>
  renderToStaticMarkup(
    createElement(RecallPlayer, { start: value, onCompleted: () => {}, onGiveUp: () => {} })
  )

describe('RecallPlayer', () => {
  it('shows the Recall label, the earlier-lessons sub-title and the first question', () => {
    const html = play(start())

    expect(html).toContain('>Recall<')
    expect(html).toContain('A quick check on your earlier lessons')
    expect(html).toContain('Question 1 of 3')
    expect(html).toContain('Question 1 ?')
    expect(html).toContain('Choix A')
    expect(html).toContain('data-testid="submit-answer"')
    expect(html).toContain('I don’t understand the question')
  })

  it('has no skip, no abandon control, no XP and no Previous on the first question', () => {
    const html = play(start())

    expect(html).not.toMatch(/skip|answer later|close|abandon|\bxp\b/i)
    expect(html).not.toContain('recall-previous')
    expect(html).not.toContain('recall-give-up')
  })

  it('tags a question on a notion that is often missed with the plain count', () => {
    const html = play(start([feedback(1, 'correct')]))

    expect(html).toContain('Question 2 of 3')
    expect(html).toContain('data-testid="recall-often-missed"')
    expect(html).toContain('You missed this notion in 3 of your last 4 answers')
    expect(html).toContain('data-testid="recall-previous"')
    expect(play(start())).not.toContain('recall-often-missed')
  })

  it('offers the results once every question is answered', () => {
    const html = play(
      start([feedback(1, 'correct'), feedback(2, 'incorrect'), feedback(3, 'correct')])
    )

    expect(html).toContain('All questions answered')
    expect(html).toContain('data-testid="recall-complete"')
  })
})

const result = (): RecallResult => ({
  session: { ...session, completedAt: '2026-10-26T10:05:00.000Z' },
  questions: [feedback(1, 'correct'), feedback(2, 'incorrect')],
  notionOutcomes: [
    { notion, correct: 1, asked: 2 },
    { notion: { id: 2, slug: 'cdn', title: 'CDN' }, correct: 1, asked: 1 }
  ]
})

describe('RecallResults', () => {
  const html = renderToStaticMarkup(
    createElement(RecallResults, { result: result(), onContinue: () => {} })
  )

  it('summarizes with a plain count and always offers the Lesson', () => {
    expect(html).toContain('You answered 1 of 2 questions correctly.')
    expect(html).toContain('Continue to the Lesson')
  })

  it('marks each notion with a glyph and a word', () => {
    expect(html).toContain('Cache-aside')
    expect(html).toContain('Some missed')
    expect(html).toContain('CDN')
    expect(html).toContain('All correct')
    expect(html).toContain('data-outcome="attention"')
    expect(html).toContain('data-outcome="mastered"')
  })

  it('has no pass or fail wording, no Mastery Threshold and no XP', () => {
    expect(html).not.toMatch(/passed|failed|not passed|mastery threshold|\bxp\b/i)
  })
})
