// The Memory Review content, rendered with react-dom/server (no DOM, so no IPC): the groups, Solid
// collapsed by default, the empty state, and what must never appear (red, a lost streak, XP).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MemoryReviewNotion, MemoryReviewView } from '../../../shared/recall'
import { MemoryReviewContent, MemoryReviewLoadError } from './MemoryReviewScreen'

const entry = (id: number, lastResults: boolean[]): MemoryReviewNotion => ({
  notion: { id, slug: `notion-${id}`, title: `Notion ${id}` },
  topicTitle: 'Cache',
  topicSlug: 'cache',
  lastResults,
  missed: lastResults.filter((result) => !result).length,
  of: lastResults.length,
  // Local dates, like memoryReviewText.test.ts: days are counted in the learner's time zone.
  lastSeenAt: new Date(2026, 9, 23, 8).toISOString(),
  sourceSections: []
})

const view: MemoryReviewView = {
  tracked: 4,
  needsAttention: 1,
  steadier: 1,
  solid: 2,
  groups: {
    needs_attention: [entry(1, [true, false, false, true, false, false])],
    steadier: [entry(2, [false, true, true])],
    solid: [entry(3, [true, true]), entry(4, [true, true, true])]
  }
}

const render = (value: MemoryReviewView, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(MemoryReviewContent, {
      view: value,
      now: new Date(2026, 9, 26, 12),
      onStart: () => {},
      onPractice: () => {},
      onOpenSection: () => {},
      ...props
    })
  )

describe('MemoryReviewContent', () => {
  it('shows the three counts and the start button', () => {
    const html = render(view)
    expect(html).toContain('Notions tracked')
    expect(html).toContain('Need attention')
    expect(html).toContain('Getting steadier')
    expect(html).toContain('Start a Recall Quiz on these')
    expect(html).not.toContain('aria-disabled="true"')
  })

  it('lists Needs attention and Getting steadier rows with their marks, counts and actions', () => {
    const html = render(view)
    expect(html).toContain('Needs attention')
    expect(html).toContain('Notion 1')
    expect(html).toContain('Notion 2')
    expect(html).toContain('in Cache')
    expect(html).toContain('Missed 4 of last 6')
    expect(html).toContain('Last seen 3 days ago')
    expect(html).toContain('aria-label="Open the lesson section for Notion 1"')
    expect(html).toContain('aria-label="Practice Notion 1"')
    // Needs attention: 2 correct and 4 missed; Getting steadier: 2 correct and 1 missed.
    expect(html.match(/aria-label="Correct"/g)).toHaveLength(4)
    expect(html.match(/aria-label="Missed"/g)).toHaveLength(5)
  })

  it('collapses Solid by default behind a disclosure button', () => {
    const html = render(view)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Solid')
    expect(html).not.toContain('Notion 3')
    expect(html).not.toContain('Notion 4')
    expect(html).toMatch(
      /<ul id="[^"]*" class="memory-list" data-testid="memory-group-solid" hidden="">/
    )
  })

  it('opens Solid when the learner asked for it', () => {
    const html = render(view, { solidOpen: true })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Notion 3')
    expect(html).toContain('Notion 4')
  })

  it('never uses red, a lost streak or any XP wording, and says what the numbers are based on', () => {
    const html = render(view)
    expect(html).not.toMatch(/\b(error|streak|XP|weakness|gaps?|flashcards?|revision|refresher)\b/i)
    expect(html).toContain('Based on the latest 6 answers per notion.')
    expect(html).toContain('Declared Mastery and Forced Unlock never count.')
  })

  it('disables the start button, with the reason, when nothing needs attention', () => {
    const calm: MemoryReviewView = {
      ...view,
      needsAttention: 0,
      groups: { ...view.groups, needs_attention: [] }
    }
    const html = render(calm)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('Available when a notion needs attention.')
    expect(html).toContain('Nothing needs attention right now.')
  })

  it('shows a calm message under the Notion a Practice had nothing to ask for', () => {
    const html = render(view, {
      notice: { scope: 1, text: 'Nothing to practice yet for this notion.' }
    })
    expect(html).toContain('role="status"')
    expect(html).toContain('Nothing to practice yet for this notion.')
  })

  it('explains the empty state when no notion is tracked yet', () => {
    const html = render({
      tracked: 0,
      needsAttention: 0,
      steadier: 0,
      solid: 0,
      groups: { needs_attention: [], steadier: [], solid: [] }
    })
    expect(html).toContain('Nothing tracked yet')
    expect(html).toContain('different quizzes')
    expect(html).not.toContain('Start a Recall Quiz on these')
  })
})

describe('MemoryReviewLoadError', () => {
  const html = renderToStaticMarkup(createElement(MemoryReviewLoadError, { onRetry: () => {} }))

  it('is calm: honey, never red, and no raw error text', () => {
    expect(html).toContain('notice-attention')
    expect(html).not.toContain('notice-error')
    expect(html).toContain('Could not load the Memory Review')
    expect(html).not.toMatch(/Error invoking|remote method/)
  })

  it('offers a way to try again', () => {
    expect(html).toContain('Try again')
  })
})
