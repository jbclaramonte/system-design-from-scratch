import { describe, expect, it } from 'vitest'
import type { MasteryState, MasteryStep } from '../../../shared/mastery'
import type { RoundView } from '../../../shared/quiz'
import { showsDeclareMastery, showsRecallGate } from './recallTrigger'

const round: RoundView = {
  id: 1,
  topicId: 1,
  quizId: 1,
  number: 1,
  startedAt: '2026-10-26T10:00:00.000Z',
  completedAt: '2026-10-26T10:05:00.000Z',
  scorePercent: 50,
  passed: false
}

const state = (step: MasteryStep, lastRound: RoundView | null = null): MasteryState => ({
  topicId: 1,
  topicTitle: 'Cache',
  status: 'not_started',
  step,
  roundNumber: 1,
  failedRounds: 0,
  masteryThreshold: 80,
  roundLimit: 3,
  lastRound,
  declared: false,
  canDeclare: true,
  canUndoDeclaration: false
})

describe('showsRecallGate', () => {
  it('shows before the initial Lesson, not yet generated', () => {
    expect(showsRecallGate(state({ name: 'lesson', lessonReady: false }), false, false)).toBe(true)
  })

  it('never shows once the Lesson exists (read before, or recorded during this visit)', () => {
    expect(showsRecallGate(state({ name: 'lesson', lessonReady: true }), false, false)).toBe(false)
    expect(showsRecallGate(state({ name: 'lesson', lessonReady: false }), true, false)).toBe(false)
  })

  it('does not come back once it is over for this visit', () => {
    expect(showsRecallGate(state({ name: 'lesson', lessonReady: false }), false, true)).toBe(false)
  })

  it('never shows for a Remediation Lesson or any other step', () => {
    const steps: MasteryStep[] = [
      { name: 'remediation', roundId: 1, anotherAngle: false, targets: [] },
      { name: 'round', roundId: 1, quizId: 1 },
      { name: 'limit_reached', roundId: 1 },
      { name: 'skipped', roundId: 1 },
      { name: 'mastered', roundId: 1 }
    ]
    for (const step of steps) expect(showsRecallGate(state(step, round), false, false)).toBe(false)
  })

  it('never shows on a Topic that already has a Round', () => {
    expect(
      showsRecallGate(state({ name: 'lesson', lessonReady: false }, round), false, false)
    ).toBe(false)
  })
})

describe('showsDeclareMastery', () => {
  const lesson = state({ name: 'lesson', lessonReady: false })

  it('offers "I already know this" when the Topic allows it and nothing covers the screen', () => {
    expect(showsDeclareMastery(lesson, { overlayOpen: false, recallGate: false })).toBe(true)
  })

  it('hides it while the Recall Quiz is showing', () => {
    expect(showsDeclareMastery(lesson, { overlayOpen: false, recallGate: true })).toBe(false)
  })

  it('hides it over an overlay, during a Round, or when the Topic cannot be declared', () => {
    expect(showsDeclareMastery(lesson, { overlayOpen: true, recallGate: false })).toBe(false)
    expect(
      showsDeclareMastery(state({ name: 'round', roundId: 1, quizId: 1 }), {
        overlayOpen: false,
        recallGate: false
      })
    ).toBe(false)
    expect(
      showsDeclareMastery(
        { ...lesson, canDeclare: false },
        { overlayOpen: false, recallGate: false }
      )
    ).toBe(false)
  })
})
