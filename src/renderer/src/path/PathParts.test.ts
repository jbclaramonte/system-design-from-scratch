import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  LearningPath,
  LearningPathStep,
  LearningPathStepStatus
} from '../../../shared/learningPath'
import { NodeFace, NodeMark, PathStrip, SectionStateChip } from './PathParts'
import { nodeView, stripView } from './pathView'

const topic = (
  status: LearningPathStepStatus,
  title = 'Cache',
  roundNumber = 2
): LearningPathStep => ({
  kind: 'topic',
  key: 'topic:cache',
  section: 'primer',
  topic: {
    id: 1,
    slug: 'cache',
    title,
    position: 1,
    inFoundationsModule: false,
    grounded: true,
    notionCount: 3,
    mastery: 'not_started',
    declared: false,
    canUndoDeclaration: false,
    roundNumber
  },
  status,
  lockedBy: null,
  forcedUnlock: false
})

const pathOf = (steps: LearningPathStep[], nextStepKey: string | null = null): LearningPath => ({
  steps,
  nextStepKey,
  progress: {
    masteredTopics: 0,
    totalTopics: steps.length,
    percent: 0,
    unlockedExercises: 0,
    totalExercises: 0
  }
})

const face = (status: LearningPathStepStatus, current = false, title?: string) => {
  const step = topic(status, title)
  const node = nodeView(pathOf([step], current ? step.key : null), step, 0)
  return renderToStaticMarkup(createElement(NodeFace, { node }))
}

describe('NodeFace', () => {
  it('says the status in words above the title, with the Round of a topic in progress', () => {
    const html = face('in_progress')
    expect(html).toContain('Step 01')
    expect(html).toContain('In progress, Round 2')
    // The status line comes before the title in the markup, and is not inside it.
    expect(html.indexOf('path-node-eyebrow')).toBeLessThan(html.indexOf('path-node-title'))
    expect(html).toMatch(/path-node-title">Cache<\/span>/)
  })

  it.each([
    ['mastered', 'Mastered', 'Review'],
    ['available', 'Not started', 'Start'],
    ['in_progress', 'In progress, Round 2', 'Resume'],
    ['skipped', 'To review', 'Come back'],
    ['limit_reached', 'To review', 'Choose how to go on']
  ] as const)('shows %s as "%s" with the action "%s"', (status, label, action) => {
    const html = face(status)
    expect(html).toContain(label)
    expect(html).toContain(`>${action}</span>`)
  })

  it('has no action on a locked node, and says Locked', () => {
    const html = face('locked')
    expect(html).toContain('Locked')
    expect(html).not.toContain('path-node-action')
  })

  it('hides the decorative parts from assistive technology: the tile, the mark and the action', () => {
    const html = face('in_progress')
    expect(html).toMatch(/icon-tile[^>]*aria-hidden="true"/)
    expect(html).toMatch(/path-node-action[^>]*aria-hidden="true"/)
    expect(html).toMatch(/path-node-mark[^>]*aria-hidden="true"/)
  })

  it('makes the action of the current node the primary button look, the others a quiet label', () => {
    expect(face('in_progress', true)).toContain('path-node-action btn btn-primary')
    expect(face('in_progress', false)).not.toContain('btn-primary')
  })

  it('keeps a very long title whole, for the screen to wrap', () => {
    const title = 'Comment concevoir un système de réplication multi-régions tolérant aux pannes '
      .repeat(3)
      .trim()
    expect(face('available', false, title)).toContain(title)
  })

  it('wraps what the control holds: chips below the title', () => {
    const step = topic('available')
    const node = nodeView(pathOf([step]), step, 0)
    const html = renderToStaticMarkup(
      createElement(
        NodeFace,
        { node },
        createElement('span', { className: 'path-node-chips' }, 'chips')
      )
    )
    expect(html.indexOf('path-node-title')).toBeLessThan(html.indexOf('path-node-chips'))
  })
})

describe('NodeMark', () => {
  it('draws a different glyph per status, so status is not color alone', () => {
    const marks = (['mastered', 'in_progress', 'available', 'skipped', 'locked'] as const).map(
      (status) => renderToStaticMarkup(createElement(NodeMark, { status }))
    )
    expect(new Set(marks).size).toBe(5)
    expect(marks[0]).toContain('M6 10.5l2.8 2.8L14 7.5')
    expect(marks[0]).toContain('status-mark-mastered')
    expect(marks[3]).toContain('status-mark-attention')
    expect(marks[4]).toContain('status-mark-neutral')
    for (const mark of marks) expect(mark).not.toContain('error')
  })
})

describe('PathStrip', () => {
  it('shows the global progress and the next milestone with its action', () => {
    const next = topic('in_progress', 'Cache')
    const dns = { ...topic('mastered', 'DNS'), key: 'topic:dns' }
    const path = pathOf([dns, next], next.key)
    path.progress = { ...path.progress, masteredTopics: 1, percent: 50 }
    const html = renderToStaticMarkup(createElement(PathStrip, { strip: stripView(path) }))
    expect(html).toContain('Global progress')
    expect(html).toContain('<strong>1</strong>')
    expect(html).toContain('/ 2')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('Next milestone')
    expect(html).toContain('Cache')
    expect(html).toContain('(Resume)')
  })

  it('says why there is no next milestone', () => {
    const html = renderToStaticMarkup(
      createElement(PathStrip, { strip: stripView(pathOf([topic('locked')])) })
    )
    expect(html).toContain('data-testid="path-no-next"')
    expect(html).toContain('Nothing to start right now.')
  })
})

describe('SectionStateChip', () => {
  it('names the state in words', () => {
    expect(renderToStaticMarkup(createElement(SectionStateChip, { state: 'complete' }))).toContain(
      'Complete'
    )
    expect(
      renderToStaticMarkup(createElement(SectionStateChip, { state: 'in_progress' }))
    ).toContain('In progress')
    expect(
      renderToStaticMarkup(createElement(SectionStateChip, { state: 'not_started' }))
    ).toContain('Not started')
  })
})
