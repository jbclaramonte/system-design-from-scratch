import { describe, expect, it } from 'vitest'
import type { MasteryState, RemediationTarget } from '../../../shared/mastery'
import {
  attemptsStat,
  firstRemediationIndex,
  masteryChip,
  declareConfirmation,
  roundPreparation
} from './masteryText'
import { topicMasteries } from '../../../shared/mastery'

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
  declared: false,
  canDeclare: true,
  canUndoDeclaration: false,
  ...changes
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

describe('firstRemediationIndex', () => {
  const target = (id: number, ready: boolean) => ({ notion: { id }, ready }) as RemediationTarget

  it('opens the first unread Remediation Lesson, else the first one', () => {
    expect(firstRemediationIndex([target(1, true), target(2, false)])).toBe(1)
    expect(firstRemediationIndex([target(1, true), target(2, true)])).toBe(0)
  })

  it('is null when a failed round left no missed notion', () => {
    expect(firstRemediationIndex([])).toBeNull()
  })
})

describe('attemptsStat', () => {
  it('counts the failed rounds against the Round Limit', () => {
    expect(attemptsStat(state({ failedRounds: 1 }))).toEqual({
      failedRounds: 1,
      roundLimit: 3,
      percent: 33,
      exhausted: false
    })
    expect(attemptsStat(state({ failedRounds: 3, status: 'limit_reached' }))).toMatchObject({
      percent: 100,
      exhausted: true
    })
  })

  it('stays within 100 percent once the limit is passed (another angle)', () => {
    expect(attemptsStat(state({ failedRounds: 5 }))).toMatchObject({
      percent: 100,
      exhausted: true
    })
  })

  it('says nothing before the lesson is recorded or once mastered', () => {
    expect(attemptsStat(state({ status: 'not_started' }))).toBeNull()
    expect(attemptsStat(state({ status: 'mastered' }))).toBeNull()
  })
})

describe('masteryChip', () => {
  it('has a chip variant for every mastery', () => {
    for (const mastery of topicMasteries) expect(masteryChip[mastery]).toMatch(/^chip/)
    expect(masteryChip.mastered).toContain('chip-mastered')
    expect(masteryChip.limit_reached).toContain('chip-error')
  })
})

describe('declareConfirmation', () => {
  it('says what the declaration does', () => {
    const text = declareConfirmation('Cache')
    expect(text).toContain('Mark Cache as already known?')
    expect(text).toContain('counts as mastered')
    expect(text).toContain('next topic unlocks')
    expect(text).toContain('no score is recorded')
    expect(text).toContain('undo')
  })
})
