// The Lesson Question UI rendered with react-dom/server (no DOM, so no selection and no IPC):
// where it is offered, and that the Lesson reading panel of a Quiz round (#35) never has it.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LessonReview } from '../../../../shared/mastery'
import { LessonReviewView } from '../../mastery/LessonReviewPanel'
import { LessonAsk } from './LessonAsk'
import { LessonQuestionPanel } from './LessonQuestionPanel'

const review: LessonReview = {
  topicId: 1,
  lesson: {
    id: 7,
    markdown: '# Le cache\n\nTexte du cours.',
    grounded: true,
    sources: [],
    recordedAt: '2026-10-09T10:00:00.000Z'
  },
  remediationLessons: []
}

describe('Lesson reading panel opened during a round (#35)', () => {
  it('offers no Ask button and no Lesson Question panel', () => {
    const html = renderToStaticMarkup(
      createElement(LessonReviewView, {
        review,
        error: null,
        selected: null,
        onSelect: () => {},
        onClose: () => {}
      })
    )

    expect(html).toContain('Texte du cours.')
    expect(html).not.toContain('lesson-ask')
  })

  it('does not even import the feature: its markup comes only from LessonAsk', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('../../mastery/LessonReviewPanel.tsx', import.meta.url),
      'utf8'
    )

    expect(source).not.toMatch(/LessonAsk|LessonQuestion|askLessonQuestion/)
  })
})

describe('LessonAsk', () => {
  const render = (enabled: boolean) =>
    renderToStaticMarkup(
      createElement(
        LessonAsk,
        { context: { kind: 'lesson', topicId: 1 }, lesson: '# Le cache', enabled },
        createElement('article', { 'data-testid': 'lesson-body' }, 'Texte du cours.')
      )
    )

  it('renders the text as it is, with no button and no panel until something is selected', () => {
    for (const enabled of [false, true]) {
      const html = render(enabled)

      expect(html).toContain('<article data-testid="lesson-body">Texte du cours.</article>')
      expect(html).not.toContain('lesson-ask-button')
      expect(html).not.toContain('lesson-ask-panel')
    }
  })
})

describe('LessonQuestionPanel', () => {
  const html = renderToStaticMarkup(
    createElement(LessonQuestionPanel, {
      context: { kind: 'lesson', topicId: 1 },
      lesson: '# Le cache',
      passage: 'L’application lit le cache.',
      focusTick: 0,
      onClose: () => {}
    })
  )

  it('quotes the passage, has the question input and a Close button', () => {
    expect(html).toContain('data-testid="lesson-ask-quote"')
    expect(html).toContain('L’application lit le cache.')
    expect(html).toContain('data-testid="lesson-ask-input"')
    expect(html).toContain('data-testid="lesson-ask-close"')
  })

  it('has nothing to send until a question is typed, and starts with an empty thread', () => {
    expect(html).toMatch(
      /data-testid="lesson-ask-send"[^>]*disabled|disabled[^>]*data-testid="lesson-ask-send"/
    )
    expect(html).not.toContain('lesson-ask-exchange')
  })
})
