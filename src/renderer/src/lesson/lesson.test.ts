import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LessonSource } from '../../../shared/lesson'
import { notionMarkerSlug, shortSourceLabel, splitCitations } from './citations'
import { LessonMarkdown } from './LessonMarkdown'
import { initialLessonState, lessonReducer, type LessonAction } from './lessonState'
import { createTextBuffer, isNearBottom, type Scheduler } from './textBuffer'

const sources: LessonSource[] = [
  {
    sectionId: 'cache/when-to-update-the-cache',
    label: 'Cache > When to update the cache',
    url: 'https://github.com/donnemartin/system-design-primer/blob/abc/README.md#when-to-update-the-cache'
  }
]

const render = (markdown: string) =>
  renderToStaticMarkup(createElement(LessonMarkdown, { markdown, sources }))

describe('citations', () => {
  it('splits text on inline citations', () => {
    expect(splitCitations('Un cache [source: cache] ou deux [source:cache/a].')).toEqual([
      { type: 'text', value: 'Un cache ' },
      { type: 'citation', sectionId: 'cache' },
      { type: 'text', value: ' ou deux ' },
      { type: 'citation', sectionId: 'cache/a' },
      { type: 'text', value: '.' }
    ])
    expect(splitCitations('Pas de source')).toEqual([{ type: 'text', value: 'Pas de source' }])
    expect(splitCitations('[source: incomplete')).toEqual([
      { type: 'text', value: '[source: incomplete' }
    ])
  })

  it('reads notion markers and short labels', () => {
    expect(notionMarkerSlug('<!-- notion: cache-aside -->\n')).toBe('cache-aside')
    expect(notionMarkerSlug('<div>no</div>')).toBeNull()
    expect(shortSourceLabel('Cache > When to update the cache')).toBe('When to update the cache')
  })
})

describe('LessonMarkdown', () => {
  it('renders citations as source chips and hides notion markers', () => {
    const html = render(
      '## Cache-aside\n<!-- notion: cache-aside -->\nLe cache [source: cache/when-to-update-the-cache] et [source: made/up].'
    )

    expect(html).toContain('<span class="lesson-notion-anchor" data-notion="cache-aside">')
    expect(html).toMatch(
      /<cite class="source-chip"><button[^>]*>When to update the cache<\/button>/
    )
    expect(html).toContain('source-chip-unknown')
    expect(html).not.toContain('[source:')
    expect(html).not.toContain('&lt;!--')
  })

  it('renders GFM tables and code blocks, never raw HTML', () => {
    const html = render(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = "[source: cache]"\n```\n\n<script>alert(1)</script><b>raw</b>'
    )

    expect(html).toContain('<table>')
    expect(html).toContain('<code class="language-js">const x = &quot;[source: cache]&quot;')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
  })

  it('only keeps http(s) links, opened in a new window', () => {
    const html = render('[ok](https://example.com) [bad](javascript:alert(1)) [file](file:///etc)')

    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer">ok</a>')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('file:')
  })
})

describe('createTextBuffer', () => {
  function manualScheduler() {
    const pending = new Map<number, () => void>()
    let next = 0
    const scheduler: Scheduler = {
      set: (callback) => (pending.set(++next, callback), next),
      clear: (handle) => pending.delete(handle as number)
    }
    const tick = () => [...pending.values()].forEach((callback) => callback())
    return { scheduler, tick, size: () => pending.size }
  }

  it('batches deltas into one flush per interval', () => {
    const flushed: string[] = []
    const { scheduler, tick, size } = manualScheduler()
    const buffer = createTextBuffer((text) => flushed.push(text), 80, scheduler)

    buffer.push('Bon')
    buffer.push('jour')
    expect(size()).toBe(1)
    expect(flushed).toEqual([])
    tick()
    buffer.push(' !')
    buffer.flush()

    expect(flushed).toEqual(['Bonjour', ' !'])
    expect(size()).toBe(0)
  })

  it('drops pending text on clear', () => {
    const onFlush = vi.fn()
    const { scheduler, size } = manualScheduler()
    const buffer = createTextBuffer(onFlush, 80, scheduler)

    buffer.push('perdu')
    buffer.clear()
    buffer.flush()

    expect(onFlush).not.toHaveBeenCalled()
    expect(size()).toBe(0)
  })

  it('follows only near the bottom', () => {
    expect(isNearBottom({ scrollTop: 560, scrollHeight: 1000, clientHeight: 400 })).toBe(true)
    expect(isNearBottom({ scrollTop: 200, scrollHeight: 1000, clientHeight: 400 })).toBe(false)
  })
})

describe('lessonReducer', () => {
  const run = (...actions: LessonAction[]) => actions.reduce(lessonReducer, initialLessonState)

  it('goes through the outline, streaming and done states', () => {
    const output = {
      content: '# Final',
      fromCache: false,
      grounded: true,
      sourceSections: ['cache'],
      cacheKey: 'k',
      usage: null
    }
    expect(
      run({ type: 'event', event: { type: 'notion_outline', status: 'generating' } }).status
    ).toBe('outline')
    const streaming = run(
      { type: 'event', event: { type: 'prepared', grounded: true, notions: [], sources } },
      { type: 'event', event: { type: 'queued' } },
      { type: 'event', event: { type: 'started', attempt: 1 } },
      { type: 'text', text: '# Fi' }
    )
    expect(streaming).toMatchObject({ status: 'generating', text: '# Fi', sources, grounded: true })

    const retried = lessonReducer(streaming, {
      type: 'event',
      event: { type: 'retry', reason: 'x' }
    })
    expect(retried.text).toBe('')

    const done = lessonReducer(retried, { type: 'event', event: { type: 'done', output } })
    expect(done).toMatchObject({ status: 'done', text: '# Final', fromCache: false })
  })

  it('separates cancellation from errors', () => {
    const cancelled = run({
      type: 'event',
      event: { type: 'error', error: { code: 'cancelled', message: 'x' } }
    })
    const failed = run({
      type: 'event',
      event: { type: 'error', error: { code: 'not_logged_in', message: 'Log in' } }
    })

    expect(cancelled.status).toBe('cancelled')
    expect(failed).toMatchObject({ status: 'error', error: { code: 'not_logged_in' } })
  })
})
