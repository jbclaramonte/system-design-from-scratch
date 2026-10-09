import { describe, expect, it } from 'vitest'
import type { MasteryState } from '../../../shared/mastery'
import { roundPreparation, roundProgress } from './masteryText'

const state = (changes: Partial<MasteryState>): MasteryState => ({
  topicId: 1,
  topicTitle: 'Cache',
  status: 'in_progress',
  step: { name: 'lesson', lessonReady: true },
  roundNumber: 1,
  failedRounds: 0,
  masteryThreshold: 100,
  roundLimit: 3,
  lastRound: null,
  ...changes
})

describe('roundProgress', () => {
  it('shows the round number and the attempt before the Round Limit', () => {
    expect(roundProgress(state({}))).toBe(
      'Round 1 · attempt 1 of 3 before the Round Limit · Mastery Threshold 100%'
    )
    expect(roundProgress(state({ roundNumber: 3, failedRounds: 2 }))).toBe(
      'Round 3 · attempt 3 of 3 before the Round Limit · Mastery Threshold 100%'
    )
    expect(roundProgress(state({ roundNumber: 4, failedRounds: 3, status: 'limit_reached' }))).toBe(
      'Round 4 · Round Limit reached (3 rounds without success) · Mastery Threshold 100%'
    )
    expect(roundProgress(state({ roundNumber: 4, failedRounds: 3 }))).toBe(
      'Round 4 · another angle after the Round Limit (3 rounds without success) · Mastery Threshold 100%'
    )
    expect(roundProgress(state({ status: 'mastered', masteryThreshold: 80 }))).toBe(
      'Mastered · Mastery Threshold 80%'
    )
  })
})

describe('roundPreparation', () => {
  it('follows the quiz Generation events', () => {
    const starting = { status: 'starting' } as const
    expect(roundPreparation(starting, { type: 'queued' })).toEqual({ status: 'queued' })
    expect(roundPreparation(starting, { type: 'started', attempt: 1 })).toEqual({
      status: 'generating'
    })
    expect(
      roundPreparation(starting, {
        type: 'error',
        error: { code: 'not_logged_in', message: 'Log in.' }
      })
    ).toEqual({ status: 'error', code: 'not_logged_in', message: 'Log in.' })
    expect(
      roundPreparation(starting, { type: 'error', error: { code: 'cancelled', message: 'x' } })
    ).toMatchObject({ status: 'cancelled' })
  })
})
