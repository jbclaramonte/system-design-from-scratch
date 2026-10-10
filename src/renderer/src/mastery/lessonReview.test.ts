// The Lesson reading panel (#35): when the topic screen offers it (every step and overlay), the
// selectable readings, and the panel rendered with react-dom/server (no DOM, so no IPC).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  LessonReview,
  MasteryState,
  MasteryStep,
  ReviewedRemediationLesson
} from '../../../shared/mastery'
import { LessonReviewView } from './LessonReviewPanel'
import { canReviewLesson, reviewTabs, selectedTab, type ReviewOverlayName } from './lessonReview'
import { TopicHeader } from './TopicScreen'

const state = (step: MasteryStep): Pick<MasteryState, 'step'> => ({ step })

describe('canReviewLesson', () => {
  const overlays: (ReviewOverlayName | null)[] = [null, 'preparing', 'play', 'results']

  it('is hidden while the Lesson is the screen, or not recorded yet', () => {
    expect(canReviewLesson(state({ name: 'lesson', lessonReady: false }), null)).toBe(false)
    expect(canReviewLesson(state({ name: 'lesson', lessonReady: true }), null)).toBe(false)
    // The quiz of the first round is being prepared before any Lesson was recorded.
    expect(canReviewLesson(state({ name: 'lesson', lessonReady: false }), 'preparing')).toBe(false)
  })

  it('is offered once the first round is being prepared or played', () => {
    const lesson = state({ name: 'lesson', lessonReady: true })
    expect(canReviewLesson(lesson, 'preparing')).toBe(true)
    expect(canReviewLesson(lesson, 'play')).toBe(true)
    expect(canReviewLesson(lesson, 'results')).toBe(true)
  })

  it.each([
    ['round', { name: 'round', roundId: 1, quizId: 1 }],
    ['remediation', { name: 'remediation', roundId: 1, anotherAngle: false, targets: [] }],
    ['limit_reached', { name: 'limit_reached', roundId: 1 }],
    ['skipped', { name: 'skipped', roundId: 1 }],
    ['mastered', { name: 'mastered', roundId: 1 }]
  ] as const)('is offered in the %s step, with or without an overlay', (_name, step) => {
    for (const overlay of overlays) expect(canReviewLesson(state(step), overlay)).toBe(true)
  })
})

const remediation = (
  id: number,
  roundNumber: number | null,
  angle: ReviewedRemediationLesson['angle'],
  title: string
): ReviewedRemediationLesson => ({
  id,
  markdown: `Remediation ${id}: ${title}`,
  grounded: true,
  sources: [],
  recordedAt: '2026-10-10T10:00:00.000Z',
  notion: { id, slug: `notion-${id}`, title, description: null },
  angle,
  roundNumber
})

const review: LessonReview = {
  topicId: 1,
  lesson: {
    id: 7,
    markdown: '# Le cache\n\nTexte du cours.',
    grounded: true,
    sources: [],
    recordedAt: '2026-10-09T10:00:00.000Z'
  },
  remediationLessons: [
    remediation(3, 2, 'analogy', 'Cache-aside'),
    remediation(2, 1, 'concrete_example', 'Write-through'),
    remediation(1, null, 'concrete_example', 'Client caching')
  ]
}

describe('reviewTabs', () => {
  it('puts the Lesson first, then the Remediation Lessons in the order given', () => {
    const tabs = reviewTabs(review)

    expect(tabs.map((t) => t.key)).toEqual([
      'lesson',
      'remediation:3',
      'remediation:2',
      'remediation:1'
    ])
    expect(tabs.map((t) => [t.title, t.detail])).toEqual([
      ['Lesson', null],
      ['Cache-aside', 'Round 2 · Analogy'],
      ['Write-through', 'Round 1 · Concrete example'],
      ['Client caching', 'Remediation Lesson · Concrete example']
    ])
  })

  it('has only Remediation Lessons when no Lesson is recorded, and nothing when empty', () => {
    expect(reviewTabs({ ...review, lesson: null }).map((t) => t.kind)).toEqual([
      'remediation',
      'remediation',
      'remediation'
    ])
    expect(reviewTabs({ topicId: 1, lesson: null, remediationLessons: [] })).toEqual([])
  })

  it('selects the requested reading, or the first one when it is gone', () => {
    const tabs = reviewTabs(review)

    expect(selectedTab(tabs, 'remediation:2')?.key).toBe('remediation:2')
    expect(selectedTab(tabs, 'remediation:99')?.key).toBe('lesson')
    expect(selectedTab(tabs, null)?.key).toBe('lesson')
    expect(selectedTab([], null)).toBeNull()
  })
})

describe('LessonReviewView', () => {
  const render = (props: Partial<Parameters<typeof LessonReviewView>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(LessonReviewView, {
        review,
        error: null,
        selected: null,
        onSelect: () => {},
        onClose: () => {},
        ...props
      })
    )

  it('shows the Lesson first with a Close button and one tab per reading', () => {
    const html = render()

    expect(html).toContain('data-testid="lesson-review"')
    expect(html).toContain('data-testid="lesson-review-close"')
    expect(html).toContain('Texte du cours.')
    expect(html).not.toContain('Remediation 3')
    expect(html).toContain('data-testid="lesson-review-tab-remediation-3"')
    // The selected tab is marked.
    expect(html).toMatch(/aria-current="true"[^>]*data-testid="lesson-review-tab-lesson"/)
    // The French notion titles are tagged as such, with the round and angle beside them.
    expect(html).toContain('<span lang="fr">Cache-aside</span>')
    expect(html).toContain('Round 2 · Analogy')
  })

  it('shows the selected Remediation Lesson', () => {
    const html = render({ selected: 'remediation:3' })

    expect(html).toContain('Remediation 3: Cache-aside')
    expect(html).not.toContain('Texte du cours.')
  })

  it('has no tabs for a single reading', () => {
    const html = render({ review: { ...review, remediationLessons: [] } })

    expect(html).toContain('Texte du cours.')
    expect(html).not.toContain('lesson-review-tabs')
  })

  it('says so when nothing is recorded, while loading, and on error', () => {
    expect(render({ review: { topicId: 1, lesson: null, remediationLessons: [] } })).toContain(
      'lesson-review-empty'
    )
    expect(render({ review: null })).toContain('Loading the Lesson...')
    const failed = render({ review: null, error: 'Cache is locked.' })
    expect(failed).toContain('Cache is locked.')
    expect(failed).not.toContain('Loading the Lesson...')
  })
})

describe('TopicHeader actions', () => {
  const lessonState: MasteryState = {
    topicId: 1,
    topicTitle: 'Cache',
    status: 'in_progress',
    step: { name: 'round', roundId: 1, quizId: 1 },
    roundNumber: 1,
    failedRounds: 0,
    masteryThreshold: 100,
    roundLimit: 3,
    lastRound: null
  }
  const header = (actions?: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(
      createElement(TopicHeader, {
        state: lessonState,
        grounded: true,
        showTitle: false,
        error: null,
        actions
      })
    )

  it('renders the actions in the progress line, and nothing without them', () => {
    expect(header(createElement('button', { 'data-testid': 'lesson-review-button' }))).toContain(
      'mastery-actions'
    )
    expect(header()).not.toContain('mastery-actions')
  })
})
