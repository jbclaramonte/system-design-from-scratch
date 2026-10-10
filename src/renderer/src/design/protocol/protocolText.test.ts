import { describe, expect, it } from 'vitest'
import type {
  ProtocolExerciseView,
  ProtocolStepView,
  SubmissionView
} from '../../../../shared/protocol'
import {
  checklistPercent,
  checklistScore,
  defaultStep,
  finalReviewState,
  hintButtonLabel,
  progressLabel,
  reviewProgress,
  stepState
} from './protocolText'

const submission = (status: SubmissionView['status']): SubmissionView => ({
  id: 1,
  number: 1,
  status,
  content: { type: 'text', text: 'x' },
  feedback: null,
  submittedAt: '2026-10-09T10:00:00.000Z'
})

const step = (overrides: Partial<ProtocolStepView>): ProtocolStepView => ({
  step: 'functional_requirements',
  active: true,
  unlockedAt: 1,
  isNew: true,
  lessonSeen: false,
  draft: '',
  submissions: [],
  hints: [],
  nextHintLevel: 1,
  ...overrides
})

describe('protocol text', () => {
  it('describes the state of a step', () => {
    expect(stepState(step({ active: false, unlockedAt: 3 }))).toEqual({
      kind: 'locked',
      label: 'Locked',
      chip: 'locked',
      detail: 'Unlocks at exercise 3'
    })
    expect(stepState(step({}))).toMatchObject({ kind: 'todo', label: 'To do' })
    expect(stepState(step({ submissions: [submission('pending')] }))).toMatchObject({
      kind: 'submitted',
      chip: 'attention'
    })
    expect(stepState(step({ submissions: [submission('failed')] }))).toMatchObject({
      kind: 'failed',
      chip: 'error',
      detail: 'Submit again'
    })
    expect(
      stepState(step({ submissions: [submission('reviewed'), submission('failed')] }))
    ).toEqual({
      kind: 'reviewed',
      label: 'Reviewed',
      chip: 'mastered',
      detail: '1 submission reviewed'
    })
  })

  it('counts reviewed steps among the active ones', () => {
    const view = {
      steps: [
        step({ submissions: [submission('reviewed')] }),
        step({ step: 'estimations', submissions: [submission('failed')] }),
        step({ step: 'api', active: false })
      ]
    }
    expect(reviewProgress(view)).toEqual({ reviewed: 1, total: 2, percent: 50 })
    expect(progressLabel({ reviewed: 1, total: 2 })).toBe('1 of 2 steps reviewed')
    expect(reviewProgress({ steps: [] })).toEqual({ reviewed: 0, total: 0, percent: 0 })
  })

  it('describes the final review entry', () => {
    expect(finalReviewState({ canRequestFinalReview: false, finalReview: null })).toMatchObject({
      kind: 'locked',
      detail: 'After every active step is reviewed'
    })
    expect(finalReviewState({ canRequestFinalReview: true, finalReview: null }).label).toBe('Ready')
    expect(finalReviewState({ canRequestFinalReview: true, finalReview: {} }).label).toBe('Done')
  })

  it('opens the first active step still to review', () => {
    const view = {
      steps: [
        step({ step: 'functional_requirements', submissions: [submission('reviewed')] }),
        step({ step: 'non_functional_requirements', active: false }),
        step({ step: 'high_level_design' })
      ]
    } as ProtocolExerciseView
    expect(defaultStep(view)).toBe('high_level_design')
    view.steps[2] = step({ step: 'high_level_design', submissions: [submission('reviewed')] })
    expect(defaultStep(view)).toBe('functional_requirements')
  })

  it('labels the Hint button with the next level', () => {
    expect(hintButtonLabel(1)).toBe('Hint 1/3 (nudge)')
    expect(hintButtonLabel(3)).toBe('Hint 3/3 (near-solution)')
    expect(hintButtonLabel(null)).toBe('No Hint left')
  })

  it('gives the share of met checklist items', () => {
    expect(checklistPercent([])).toBe(0)
    expect(checklistPercent([{ verdict: 'met' }, { verdict: 'missing' }])).toBe(50)
  })

  it('counts met checklist items', () => {
    expect(checklistScore([{ verdict: 'met' }, { verdict: 'partial' }, { verdict: 'met' }])).toBe(
      '2/3 checklist items met'
    )
  })
})
