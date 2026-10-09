import { describe, expect, it } from 'vitest'
import type {
  ProtocolExerciseView,
  ProtocolStepView,
  SubmissionView
} from '../../../../shared/protocol'
import { checklistScore, defaultStep, hintButtonLabel, stepStatus } from './protocolText'

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
    expect(stepStatus(step({ active: false, unlockedAt: 3 }))).toBe('Locked: unlocks at exercise 3')
    expect(stepStatus(step({}))).toBe('Not submitted yet')
    expect(stepStatus(step({ submissions: [submission('failed')] }))).toMatch(/failed/)
    expect(stepStatus(step({ submissions: [submission('reviewed'), submission('failed')] }))).toBe(
      'Reviewed (1 submission)'
    )
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

  it('counts met checklist items', () => {
    expect(checklistScore([{ verdict: 'met' }, { verdict: 'partial' }, { verdict: 'met' }])).toBe(
      '2/3 checklist items met'
    )
  })
})
