import { describe, expect, it } from 'vitest'
import { HISTORY_ROUND_LIMIT, type WeakPoint } from '../../shared/dashboard'
import type { LearningPath, LearningPathStepStatus, TopicStep } from '../../shared/learningPath'
import type { NotionRef, NotionScore } from '../../shared/quiz'
import {
  buildDashboard,
  compareWeakPoints,
  notionTrend,
  weakPointReason,
  type AttemptSnapshot,
  type DashboardSnapshot,
  type RoundSnapshot,
  type TopicSnapshot
} from './model'

const cache: NotionRef[] = [
  { id: 1, slug: 'cache-aside', title: 'Cache-aside' },
  { id: 2, slug: 'write-through', title: 'Write-through' },
  { id: 3, slug: 'eviction', title: 'Eviction' }
]

function step(
  id: number,
  title: string,
  status: LearningPathStepStatus = 'in_progress'
): TopicStep {
  return {
    kind: 'topic',
    key: `topic:t${id}`,
    section: 'primer',
    topic: {
      id,
      slug: `t${id}`,
      title,
      position: id,
      inFoundationsModule: false,
      grounded: true,
      notionCount: 0,
      mastery: status === 'locked' || status === 'available' ? 'not_started' : 'in_progress'
    },
    status,
    lockedBy: null
  }
}

const path = (masteredTopics = 0, totalTopics = 2): LearningPath => ({
  steps: [],
  nextStepKey: null,
  progress: {
    masteredTopics,
    totalTopics,
    percent: totalTopics === 0 ? 0 : Math.floor((masteredTopics * 100) / totalTopics),
    unlockedExercises: 0,
    totalExercises: 0
  }
})

let nextAttemptId = 1

const attempt = (
  notionIds: number[],
  score: number,
  attemptedAt: string,
  extra: Partial<AttemptSnapshot> = {}
): AttemptSnapshot => ({
  id: nextAttemptId++,
  questionId: nextAttemptId,
  prompt: 'Question',
  questionType: 'single_choice',
  result: score === 1 ? 'correct' : 'incorrect',
  score,
  notionIds,
  attemptedAt,
  contested: false,
  ...extra
})

const score = (notion: NotionRef, scorePercent: number): NotionScore => ({
  ...notion,
  questionCount: 1,
  earned: scorePercent / 100,
  scorePercent,
  missed: scorePercent < 100
})

/** A completed round on day `day` with one attempt per notion score. */
function round(
  id: number,
  number: number,
  day: number,
  scores: [NotionRef, number][],
  { passed, open = false }: { passed?: boolean; open?: boolean } = {}
): RoundSnapshot {
  const at = `2026-10-0${day}T10:00:00.000Z`
  const attempts = scores.map(([notion, percent]) => attempt([notion.id], percent / 100, at))
  const total = scores.reduce((sum, [, percent]) => sum + percent, 0) / (scores.length || 1)
  return {
    id,
    number,
    startedAt: at,
    completedAt: open ? null : at,
    scorePercent: open ? null : total,
    passed: open ? null : (passed ?? total >= 100),
    notionScores: open ? [] : scores.map(([notion, percent]) => score(notion, percent)),
    attempts
  }
}

const snapshot = (topics: TopicSnapshot[], threshold = 100): DashboardSnapshot => ({
  path: path(0, topics.length),
  topics,
  masteryThreshold: threshold,
  roundLimit: 3
})

describe('notionTrend', () => {
  it('needs at least two scores', () => {
    expect(notionTrend([])).toBeNull()
    expect(notionTrend([50])).toBeNull()
  })

  it('compares the latest score with the mean of the previous ones in the last three', () => {
    expect(notionTrend([0, 100])).toBe('improving')
    expect(notionTrend([100, 0])).toBe('regressing')
    expect(notionTrend([50, 50, 50])).toBe('flat')
    expect(notionTrend([0, 100, 0])).toBe('regressing')
    expect(notionTrend([0, 0, 100])).toBe('improving')
    // Only the last three scores count: the old 0 is out of the window.
    expect(notionTrend([0, 100, 100, 100])).toBe('flat')
    // Within the tolerance: flat.
    expect(notionTrend([50, 53])).toBe('flat')
  })
})

describe('weakPointReason', () => {
  it('says how often the notion was missed, and whether in the last round', () => {
    expect(
      weakPointReason({ roundsMissed: 3, roundsTested: 3, missedInLastRound: true, trend: 'flat' })
    ).toBe('Missed in 3 of 3 rounds, including the last one')
    expect(
      weakPointReason({ roundsMissed: 1, roundsTested: 1, missedInLastRound: true, trend: null })
    ).toBe('Missed in 1 of 1 round, the last one')
    expect(
      weakPointReason({
        roundsMissed: 2,
        roundsTested: 3,
        missedInLastRound: false,
        trend: 'regressing'
      })
    ).toBe('Missed in 2 of 3 rounds, regressing')
  })
})

describe('buildDashboard', () => {
  it('shows an empty Dashboard on a fresh install', () => {
    const dashboard = buildDashboard(
      snapshot([{ step: step(1, 'Cache'), notions: [], rounds: [] }])
    )
    expect(dashboard.overview).toEqual({
      masteredTopics: 0,
      totalTopics: 1,
      percent: 0,
      roundsCompleted: 0,
      roundsInProgress: 0,
      attemptCount: 0,
      accuracyPercent: null,
      lastActivityAt: null
    })
    expect(dashboard.notionMap).toEqual([])
    expect(dashboard.weakPoints).toEqual([])
    expect(dashboard.history).toEqual([])
    expect(dashboard.topics[0]).toMatchObject({
      rounds: [],
      bestScorePercent: null,
      latestScorePercent: null,
      failedRounds: 0,
      notionsMastered: 0,
      notionCount: 0,
      lastPracticedAt: null
    })
  })

  it('lists every notion of a topic with an outline but no attempts, untested', () => {
    const dashboard = buildDashboard(
      snapshot([{ step: step(1, 'Cache'), notions: cache, rounds: [] }])
    )
    expect(dashboard.notionMap).toHaveLength(1)
    expect(dashboard.notionMap[0]!.notions.map((cell) => cell.slug)).toEqual([
      'cache-aside',
      'write-through',
      'eviction'
    ])
    for (const cell of dashboard.notionMap[0]!.notions) {
      expect(cell).toMatchObject({
        latestScorePercent: null,
        scores: [],
        attemptCount: 0,
        lastPracticedAt: null,
        trend: null,
        mastered: false
      })
    }
    expect(dashboard.weakPoints).toEqual([])
    expect(dashboard.topics[0]!.notionCount).toBe(3)
  })

  it('aggregates rounds, scores and notions of a topic', () => {
    const [aside, through, eviction] = cache as [NotionRef, NotionRef, NotionRef]
    const topic: TopicSnapshot = {
      step: step(1, 'Cache'),
      notions: cache,
      rounds: [
        round(10, 1, 1, [
          [aside, 0],
          [through, 100]
        ]),
        round(11, 2, 2, [
          [aside, 0],
          [through, 100],
          [eviction, 0]
        ]),
        round(12, 3, 3, [
          [aside, 100],
          [eviction, 0]
        ])
      ]
    }
    const dashboard = buildDashboard(snapshot([topic]))

    const row = dashboard.topics[0]!
    expect(row.rounds.map((r) => [r.number, r.status, r.scorePercent])).toEqual([
      [1, 'failed', 50],
      [2, 'failed', 100 / 3],
      [3, 'failed', 50]
    ])
    expect(row.bestScorePercent).toBe(50)
    expect(row.latestScorePercent).toBe(50)
    expect(row.failedRounds).toBe(3)
    expect(row.roundLimit).toBe(3)
    expect(row.notionsMastered).toBe(2)
    expect(row.lastPracticedAt).toBe('2026-10-03T10:00:00.000Z')

    const [asideCell, throughCell, evictionCell] = dashboard.notionMap[0]!.notions
    expect(asideCell).toMatchObject({
      latestScorePercent: 100,
      scores: [0, 0, 100],
      attemptCount: 3,
      trend: 'improving',
      mastered: true,
      lastPracticedAt: '2026-10-03T10:00:00.000Z'
    })
    // Not tested in the last round: its latest score is the one of round 2.
    expect(throughCell).toMatchObject({
      latestScorePercent: 100,
      scores: [100, 100],
      trend: 'flat'
    })
    expect(evictionCell).toMatchObject({ latestScorePercent: 0, mastered: false, trend: 'flat' })

    expect(dashboard.weakPoints.map((w) => [w.notion.slug, w.reason])).toEqual([
      ['eviction', 'Missed in 2 of 2 rounds, including the last one']
    ])
    expect(dashboard.overview).toMatchObject({
      roundsCompleted: 3,
      roundsInProgress: 0,
      attemptCount: 7,
      accuracyPercent: (3 * 100) / 7,
      lastActivityAt: '2026-10-03T10:00:00.000Z'
    })
  })

  it('shows an open round in progress, never as a failure, and leaves it out of notion scores', () => {
    const [aside] = cache as [NotionRef]
    const topic: TopicSnapshot = {
      step: step(1, 'Cache'),
      notions: cache,
      rounds: [round(10, 1, 1, [[aside, 0]]), round(11, 2, 2, [[aside, 100]], { open: true })]
    }
    const dashboard = buildDashboard(snapshot([topic]))
    const row = dashboard.topics[0]!
    expect(row.rounds.map((r) => r.status)).toEqual(['failed', 'in_progress'])
    expect(row.rounds[1]!.scorePercent).toBeNull()
    expect(row.failedRounds).toBe(1)
    expect(row.latestScorePercent).toBe(0)
    expect(dashboard.overview.roundsInProgress).toBe(1)
    // Its attempt counts as practice, not as a score.
    const cell = dashboard.notionMap[0]!.notions[0]!
    expect(cell).toMatchObject({ latestScorePercent: 0, scores: [0], attemptCount: 2 })
    expect(cell.lastPracticedAt).toBe('2026-10-02T10:00:00.000Z')
    expect(dashboard.weakPoints.map((w) => w.notion.slug)).toEqual(['cache-aside'])
  })

  it('judges notions against the current threshold, rounds against the stored outcome', () => {
    const [aside, through] = cache as [NotionRef, NotionRef]
    const topic: TopicSnapshot = {
      step: step(1, 'Cache', 'mastered'),
      notions: cache,
      // Passed at a 50% threshold; the threshold is now back to 100.
      rounds: [
        round(
          10,
          1,
          1,
          [
            [aside, 100],
            [through, 0]
          ],
          { passed: true }
        )
      ]
    }
    const at100 = buildDashboard(snapshot([topic], 100))
    expect(at100.topics[0]!.rounds[0]!.status).toBe('passed')
    expect(at100.topics[0]!.notionsMastered).toBe(1)
    expect(at100.weakPoints.map((w) => w.notion.slug)).toEqual(['write-through'])

    const at50 = buildDashboard(snapshot([topic], 50))
    expect(at50.topics[0]!.rounds[0]!.status).toBe('passed')
    expect(at50.weakPoints.map((w) => w.notion.slug)).toEqual(['write-through'])
    expect(buildDashboard(snapshot([topic], 50)).masteryThreshold).toBe(50)
  })

  it('ranks weak points by lowest score, then most misses, then most recent practice', () => {
    const notions: NotionRef[] = [
      { id: 1, slug: 'a', title: 'A' },
      { id: 2, slug: 'b', title: 'B' },
      { id: 3, slug: 'c', title: 'C' },
      { id: 4, slug: 'd', title: 'D' }
    ]
    const [a, b, c, d] = notions as [NotionRef, NotionRef, NotionRef, NotionRef]
    const topic: TopicSnapshot = {
      step: step(1, 'Cache'),
      notions,
      rounds: [
        round(10, 1, 1, [
          [a, 0],
          [b, 0],
          [d, 50]
        ]),
        round(11, 2, 2, [
          [a, 0],
          [c, 0]
        ]),
        round(12, 3, 3, [[b, 50]])
      ]
    }
    const dashboard = buildDashboard(snapshot([topic]))
    // a: 0%, missed twice; c: 0%, missed once (round 2); b: 50%; d: 50%, older.
    expect(dashboard.weakPoints.map((w) => w.notion.slug)).toEqual(['a', 'c', 'b', 'd'])
    expect(dashboard.weakPoints.map((w) => w.missedInLastRound)).toEqual([
      false,
      false,
      true,
      false
    ])
  })

  it('compareWeakPoints breaks the last tie on the most recent practice', () => {
    const weak = (lastPracticedAt: string | null) =>
      ({
        notion: { latestScorePercent: 0, lastPracticedAt },
        roundsMissed: 1
      }) as WeakPoint
    expect(compareWeakPoints(weak('2026-10-02'), weak('2026-10-01'))).toBeLessThan(0)
    expect(compareWeakPoints(weak(null), weak('2026-10-01'))).toBeGreaterThan(0)
  })

  it('lists the attempt history most recent first, with notions and contested free answers', () => {
    const [aside] = cache as [NotionRef]
    const free = attempt([1], 1, '2026-10-02T10:05:00.000Z', {
      questionType: 'free_answer',
      result: 'correct',
      contested: true
    })
    const second = round(11, 2, 2, [[aside, 0]])
    const cacheTopic: TopicSnapshot = {
      step: step(1, 'Cache'),
      notions: cache,
      rounds: [round(10, 1, 1, [[aside, 0]]), { ...second, attempts: [...second.attempts, free] }]
    }
    const other: TopicSnapshot = {
      step: step(2, 'Queues'),
      notions: [],
      rounds: [round(20, 1, 3, [], { open: true })]
    }
    const dashboard = buildDashboard(snapshot([cacheTopic, other]))
    expect(dashboard.history.map((r) => [r.topicTitle, r.number, r.status])).toEqual([
      ['Queues', 1, 'in_progress'],
      ['Cache', 2, 'failed'],
      ['Cache', 1, 'failed']
    ])
    const contested = dashboard.history[1]!.attempts[1]!
    expect(contested).toMatchObject({
      questionType: 'free_answer',
      result: 'correct',
      contested: true
    })
    expect(contested.notions).toEqual([aside])
    expect(dashboard.historyTopicId).toBeNull()

    const filtered = buildDashboard(snapshot([cacheTopic, other]), { historyTopicId: 1 })
    expect(filtered.history.map((r) => r.topicTitle)).toEqual(['Cache', 'Cache'])
    expect(filtered.historyTopicId).toBe(1)
    // The filter only restricts the history.
    expect(filtered.topics).toHaveLength(2)
  })

  it(`keeps the ${HISTORY_ROUND_LIMIT} most recent rounds in the history`, () => {
    const rounds = Array.from({ length: HISTORY_ROUND_LIMIT + 5 }, (_, i) => ({
      ...round(i + 1, i + 1, 1, []),
      startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    }))
    const dashboard = buildDashboard(snapshot([{ step: step(1, 'Cache'), notions: [], rounds }]))
    expect(dashboard.history).toHaveLength(HISTORY_ROUND_LIMIT)
    expect(dashboard.history[0]!.number).toBe(HISTORY_ROUND_LIMIT + 5)
  })
})
