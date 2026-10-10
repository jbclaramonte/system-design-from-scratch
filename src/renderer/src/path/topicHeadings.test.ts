// Server-side rendering (react-dom/server, no DOM needed) of the topic screen's parts: the topic
// title and the Outside the primer badge must appear once (#21). Effects do not run, so no IPC.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MasteryState, TopicMasterySummary } from '../../../shared/mastery'
import { LessonScreen } from '../lesson/LessonScreen'
import { TopicHeader } from '../mastery/TopicScreen'
import { PathTopicView } from './PathTopicView'

const topic: TopicMasterySummary = {
  id: 1,
  slug: 'how-the-web-works',
  title: 'Comment fonctionne le web',
  position: 1,
  inFoundationsModule: true,
  grounded: false,
  notionCount: 0,
  mastery: 'not_started'
}

const state: MasteryState = {
  topicId: 1,
  topicTitle: topic.title,
  status: 'not_started',
  step: { name: 'lesson', lessonReady: false },
  roundNumber: 1,
  failedRounds: 0,
  masteryThreshold: 100,
  roundLimit: 3,
  lastRound: null
}

const count = (html: string, text: string) => html.split(text).length - 1
const headings = (html: string) =>
  [...html.matchAll(/<(h[1-6])[^>]*>(.*?)<\/\1>/g)].map((m) => `${m[1]}:${m[2]}`)

/** The topic screen opened from the Learning Path, as its parts render once the state loaded. */
function topicFromPath(): string {
  const noop = () => {}
  return [
    renderToStaticMarkup(createElement(PathTopicView, { topic, onBack: noop, onOpenTopic: noop })),
    renderToStaticMarkup(
      createElement(TopicHeader, { state, grounded: topic.grounded, showTitle: false, error: null })
    ),
    renderToStaticMarkup(createElement(LessonScreen, { topic, onRetry: noop, embedded: true }))
  ].join('')
}

describe('topic screen headings', () => {
  it('shows the title once, as the page heading, and the Outside the primer badge once', () => {
    const html = topicFromPath()

    expect(count(html, topic.title)).toBe(1)
    expect(headings(html)).toEqual([`h1:${topic.title}`])
    expect(count(html, 'Outside the primer')).toBe(1)
    // Title, then the progress line, then the lesson.
    expect(html.indexOf(topic.title)).toBeLessThan(html.indexOf('mastery-progress'))
    expect(html.indexOf('mastery-progress')).toBeLessThan(html.indexOf('lesson-screen'))
  })

  it('keeps the title and the badge in the standalone dev screens', () => {
    const noop = () => {}
    const lesson = renderToStaticMarkup(createElement(LessonScreen, { topic, onRetry: noop }))
    const header = renderToStaticMarkup(
      createElement(TopicHeader, { state, grounded: false, showTitle: true, error: null })
    )

    expect(headings(lesson)).toEqual([`h2:${topic.title}`])
    expect(count(lesson, 'Outside the primer')).toBe(1)
    expect(headings(header)).toEqual([`h2:${topic.title}`])
  })
})
