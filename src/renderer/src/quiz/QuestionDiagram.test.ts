import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { QuestionView, RoundStart } from '../../../shared/quiz'
import { DIAGRAM_FLAG_REASON, DiagramFlagOffer, diagramFlagReason } from './QuestionDiagram'
import { QuizPlayer } from './QuizPlayer'

const diagram = 'flowchart LR\n  C[Client] -->|requête| S[Serveur web]\n  S -->|lecture| K[Cache]'

const question = (overrides: Partial<QuestionView> = {}): QuestionView => ({
  id: 7,
  position: 0,
  type: 'scenario',
  prompt: 'Que se passe-t-il si le cache tombe ?',
  scenario: 'Ton site lit beaucoup.',
  diagram,
  choices: ['Les lectures vont à la database', 'Le site s’arrête', 'Rien'],
  notions: [],
  gradable: true,
  ...overrides
})

const start = (questions: QuestionView[]): RoundStart => ({
  round: {
    id: 1,
    topicId: 1,
    quizId: 1,
    number: 1,
    startedAt: '2026-10-09',
    completedAt: null,
    scorePercent: null,
    passed: null
  },
  quiz: { id: 1, topicId: 1, topicTitle: 'Cache', grounded: true, questions },
  answered: []
})

const renderPlayer = (questions: QuestionView[]) =>
  renderToStaticMarkup(
    createElement(QuizPlayer, { start: start(questions), onCompleted: () => {} })
  )

describe('quiz player diagrams', () => {
  it('shows the Diagram with the question before answering', () => {
    const html = renderPlayer([question()])

    expect(html).toContain('data-testid="question-diagram"')
    expect(html).toContain('data-kind="render"')
    // Drawn after mount (mermaid needs the DOM): the placeholder is shown first.
    expect(html).toContain('Diagram loading…')
    expect(html.indexOf('question-scenario')).toBeLessThan(html.indexOf('question-diagram'))
    expect(html.indexOf('question-diagram')).toBeLessThan(html.indexOf('choice-0'))
  })

  it('shows no Diagram for a question without one', () => {
    expect(renderPlayer([question({ diagram: null })])).not.toContain('question-diagram')
  })

  it('falls back to the source with a note and keeps the question playable', () => {
    const html = renderPlayer([question({ diagram: 'flowchart LR\n  A --> B\n  click A "x"' })])

    expect(html).toContain('data-testid="diagram-fallback"')
    expect(html).toContain('This diagram could not be drawn.')
    expect(html).toContain('click A')
    expect(html).toContain('data-testid="choice-0"')
    expect(html).toContain('data-testid="submit-answer"')
  })

  it('pre-fills the flag offer with the diagram reason', () => {
    const reason = diagramFlagReason({
      source: 'x',
      error: { code: 'parse_error', message: 'Parse error on line 2' }
    })
    expect(reason).toBe(`${DIAGRAM_FLAG_REASON} (parse_error: Parse error on line 2)`)
    expect(reason.startsWith('diagram could not be drawn')).toBe(true)

    const html = renderToStaticMarkup(createElement(DiagramFlagOffer, { questionId: 7, reason }))
    expect(html).toContain('data-testid="diagram-flag-offer"')
    expect(html).toContain(`value="${reason}"`)
    expect(html).toContain('Flag this question')
    expect(html).toContain('You can still answer this question.')
  })
})
