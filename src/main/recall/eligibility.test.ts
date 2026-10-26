import { describe, expect, it } from 'vitest'
import { eligibleTopicIds, passedTopics, type PassedTopic } from './eligibility'

const round = (topicId: number, completedAt: string | null, passed: boolean | null) => ({
  topicId,
  completedAt,
  passed
})

describe('passedTopics', () => {
  it('counts a Topic passed by a Round at the Round completion date', () => {
    expect(
      passedTopics({ rounds: [round(1, '2026-10-01T10:00:00.000Z', true)], declared: [] })
    ).toEqual([{ topicId: 1, passedAt: '2026-10-01T10:00:00.000Z' }])
  })

  it('counts a declared Topic at its declaration date', () => {
    expect(
      passedTopics({
        rounds: [],
        declared: [{ topicId: 2, createdAt: '2026-10-02T10:00:00.000Z' }]
      })
    ).toEqual([{ topicId: 2, passedAt: '2026-10-02T10:00:00.000Z' }])
  })

  it('counts a Topic declared then passed by a Round once, with the earlier date', () => {
    const result = passedTopics({
      rounds: [round(1, '2026-10-05T10:00:00.000Z', true)],
      declared: [{ topicId: 1, createdAt: '2026-10-01T10:00:00.000Z' }]
    })
    expect(result).toEqual([{ topicId: 1, passedAt: '2026-10-01T10:00:00.000Z' }])
  })

  it('uses the first passing Round when the Round came before the declaration', () => {
    const result = passedTopics({
      rounds: [
        round(1, '2026-10-06T10:00:00.000Z', true),
        round(1, '2026-10-03T10:00:00.000Z', true)
      ],
      declared: [{ topicId: 1, createdAt: '2026-10-09T10:00:00.000Z' }]
    })
    expect(result).toEqual([{ topicId: 1, passedAt: '2026-10-03T10:00:00.000Z' }])
  })

  it('ignores failed and open Rounds', () => {
    expect(
      passedTopics({
        rounds: [
          round(1, '2026-10-01T10:00:00.000Z', false),
          round(2, null, null),
          round(3, null, true)
        ],
        declared: []
      })
    ).toEqual([])
  })
})

describe('eligibleTopicIds', () => {
  const passed: PassedTopic[] = [
    { topicId: 1, passedAt: '2026-10-01T10:00:00.000Z' },
    { topicId: 2, passedAt: '2026-10-03T10:00:00.000Z' },
    { topicId: 3, passedAt: '2026-10-02T10:00:00.000Z' },
    { topicId: 4, passedAt: '2026-10-04T10:00:00.000Z' }
  ]

  it('drops the most recently passed Topic and the opening Topic', () => {
    expect(eligibleTopicIds(passed, 3).sort()).toEqual([1, 2])
  })

  it('drops the latest by date, whatever the path order', () => {
    // Topic 2 is the latest passed here, although it comes first in the list.
    const outOfOrder: PassedTopic[] = [
      { topicId: 2, passedAt: '2026-10-09T10:00:00.000Z' },
      { topicId: 1, passedAt: '2026-10-01T10:00:00.000Z' },
      { topicId: 3, passedAt: '2026-10-02T10:00:00.000Z' }
    ]
    expect(eligibleTopicIds(outOfOrder, 99).sort()).toEqual([1, 3])
  })

  it('returns nothing with a single passed Topic', () => {
    expect(eligibleTopicIds(passed.slice(0, 1), 99)).toEqual([])
  })

  it('returns nothing without passed Topics', () => {
    expect(eligibleTopicIds([], 1)).toEqual([])
  })
})
