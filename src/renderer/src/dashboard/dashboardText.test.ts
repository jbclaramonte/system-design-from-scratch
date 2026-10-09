import { describe, expect, it } from 'vitest'
import type { DashboardTopic, NotionMapCell } from '../../../shared/dashboard'
import type { TopicStep } from '../../../shared/learningPath'
import {
  cellDescription,
  heatLegend,
  heatLevel,
  isEmptyDashboard,
  notionProgress,
  percentOrDash,
  practiceState,
  roundLimitText,
  timeSince
} from './dashboardText'

const cell = (overrides: Partial<NotionMapCell> = {}): NotionMapCell => ({
  id: 1,
  slug: 'cache-aside',
  title: 'Cache-aside',
  latestScorePercent: null,
  scores: [],
  attemptCount: 0,
  lastPracticedAt: null,
  trend: null,
  mastered: false,
  ...overrides
})

const step = (overrides: Partial<TopicStep> = {}): TopicStep => ({
  kind: 'topic',
  key: 'topic:cache',
  section: 'primer',
  topic: {
    id: 1,
    slug: 'cache',
    title: 'Cache',
    position: 1,
    inFoundationsModule: false,
    grounded: true,
    notionCount: 3,
    mastery: 'in_progress'
  },
  status: 'in_progress',
  lockedBy: null,
  ...overrides
})

const topic = (overrides: Partial<DashboardTopic> = {}): DashboardTopic => ({
  step: step(),
  rounds: [],
  bestScorePercent: null,
  latestScorePercent: null,
  failedRounds: 0,
  roundLimit: 3,
  notionsMastered: 0,
  notionCount: 3,
  lastPracticedAt: null,
  ...overrides
})

describe('heatLevel', () => {
  it('buckets a cell by its latest score and the mastered flag', () => {
    expect(heatLevel(cell())).toBe('untested')
    expect(heatLevel(cell({ latestScorePercent: 0 }))).toBe('low')
    expect(heatLevel(cell({ latestScorePercent: 49.9 }))).toBe('low')
    expect(heatLevel(cell({ latestScorePercent: 50 }))).toBe('partial')
    expect(heatLevel(cell({ latestScorePercent: 80, mastered: true }))).toBe('mastered')
  })

  it('drops the partial level from the legend at a 50% threshold', () => {
    expect(heatLegend(100).map((item) => item.level)).toEqual([
      'mastered',
      'partial',
      'low',
      'untested'
    ])
    expect(heatLegend(50).map((item) => item.level)).toEqual(['mastered', 'low', 'untested'])
    expect(heatLegend(80)[0]!.label).toBe('Mastered (80% or more)')
  })
})

describe('cellDescription', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')

  it('describes a tested notion with words, not colour', () => {
    expect(
      cellDescription(
        cell({
          latestScorePercent: 50,
          scores: [0, 50],
          attemptCount: 4,
          lastPracticedAt: '2026-10-09T10:00:00.000Z',
          trend: 'improving'
        }),
        now
      )
    ).toBe(
      'Cache-aside: latest score 50%, not mastered, trend improving, 4 attempts, last practiced 2 hours ago'
    )
  })

  it('describes an untested notion', () => {
    expect(cellDescription(cell(), now)).toBe('Cache-aside: not tested yet.')
    expect(cellDescription(cell({ attemptCount: 1 }), now)).toBe(
      'Cache-aside: not tested yet, 1 attempt in an open round.'
    )
  })
})

describe('timeSince', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  it('reads as a duration', () => {
    expect(timeSince(null, now)).toBe('Never')
    expect(timeSince('2026-10-09T11:59:30.000Z', now)).toBe('Just now')
    expect(timeSince('2026-10-09T11:59:00.000Z', now)).toBe('1 minute ago')
    expect(timeSince('2026-10-09T09:00:00.000Z', now)).toBe('3 hours ago')
    expect(timeSince('2026-10-07T12:00:00.000Z', now)).toBe('2 days ago')
  })
})

describe('percentOrDash', () => {
  it('rounds to one decimal and shows a dash for no value', () => {
    expect(percentOrDash(null)).toBe('–')
    expect(percentOrDash(100)).toBe('100%')
    expect(percentOrDash(100 / 3)).toBe('33.3%')
  })
})

describe('topic helpers', () => {
  it('computes the notion progress, 0 without an outline', () => {
    expect(notionProgress(topic({ notionsMastered: 2, notionCount: 3 }))).toBe(66)
    expect(notionProgress(topic({ notionCount: 0 }))).toBe(0)
  })

  it('states the Round Limit', () => {
    expect(roundLimitText(topic({ failedRounds: 1 }))).toBe('1 of 3 failed rounds')
    expect(roundLimitText(topic({ failedRounds: 3 }))).toBe('Round Limit reached')
    const mastered = step()
    mastered.topic = { ...mastered.topic, mastery: 'mastered' }
    expect(roundLimitText(topic({ step: mastered }))).toBe('Mastered')
  })
})

describe('practiceState', () => {
  it('allows an unlocked topic and explains a locked one', () => {
    expect(practiceState(step())).toEqual({ enabled: true })
    expect(
      practiceState(
        step({
          status: 'locked',
          lockedBy: { slug: 'dns', title: 'DNS', status: 'skipped' }
        })
      )
    ).toEqual({
      enabled: false,
      reason: 'Master DNS first. It was skipped: come back to it with another angle.'
    })
  })
})

describe('isEmptyDashboard', () => {
  it('is empty until a round or attempt exists', () => {
    const overview = { roundsCompleted: 0, roundsInProgress: 0, attemptCount: 0 }
    expect(isEmptyDashboard({ overview })).toBe(true)
    expect(isEmptyDashboard({ overview: { ...overview, roundsInProgress: 1 } })).toBe(false)
  })
})
