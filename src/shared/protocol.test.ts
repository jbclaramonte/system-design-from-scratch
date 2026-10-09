import { describe, expect, it } from 'vitest'
import {
  activeStepsFor,
  isProtocolStep,
  newStepsFor,
  nextHintLevel,
  previousActiveSteps,
  PROTOCOL_STEP_DEFINITIONS,
  PROTOCOL_UNLOCK_PLAN,
  protocolSteps,
  unlockedAt
} from './protocol'

describe('Interview Protocol definition', () => {
  it('lists the steps in canonical interview order', () => {
    expect(protocolSteps).toEqual([
      'functional_requirements',
      'non_functional_requirements',
      'estimations',
      'api',
      'data_model',
      'high_level_design',
      'deep_dive'
    ])
  })

  it('defines every step with a goal and a checklist', () => {
    for (const step of protocolSteps) {
      const definition = PROTOCOL_STEP_DEFINITIONS[step]
      expect(definition.step).toBe(step)
      expect(definition.goal.length).toBeGreaterThan(20)
      expect(definition.checklist.length).toBeGreaterThanOrEqual(3)
      expect(new Set(definition.checklist.map((item) => item.id)).size).toBe(
        definition.checklist.length
      )
    }
  })

  it('uses the Design Canvas for the high-level design and the deep dive only', () => {
    expect(
      protocolSteps.filter((step) => PROTOCOL_STEP_DEFINITIONS[step].input === 'canvas')
    ).toEqual(['high_level_design', 'deep_dive'])
  })

  it('unlocks every step exactly once', () => {
    const added = PROTOCOL_UNLOCK_PLAN.flatMap(({ adds }) => adds)
    expect([...added].sort()).toEqual([...protocolSteps].sort())
    expect(PROTOCOL_UNLOCK_PLAN.map(({ exerciseIndex }) => exerciseIndex)).toEqual([1, 2, 3, 4, 5])
  })

  it('activates only functional requirements and high-level design in exercise 1', () => {
    expect(activeStepsFor(1)).toEqual(['functional_requirements', 'high_level_design'])
    expect(newStepsFor(1)).toEqual(['functional_requirements', 'high_level_design'])
  })

  it('adds steps progressively, in canonical order', () => {
    expect(activeStepsFor(2)).toEqual([
      'functional_requirements',
      'estimations',
      'high_level_design'
    ])
    expect(newStepsFor(3)).toEqual(['api', 'data_model'])
    expect(activeStepsFor(4)).toEqual([
      'functional_requirements',
      'non_functional_requirements',
      'estimations',
      'api',
      'data_model',
      'high_level_design'
    ])
    expect(activeStepsFor(5)).toEqual(protocolSteps)
    expect(activeStepsFor(8)).toEqual(protocolSteps)
    expect(newStepsFor(8)).toEqual([])
    expect(unlockedAt('deep_dive')).toBe(5)
  })

  it('never removes a step from one exercise to the next', () => {
    for (let index = 1; index < 8; index++) {
      const now = activeStepsFor(index)
      expect(activeStepsFor(index + 1)).toEqual(expect.arrayContaining(now))
      expect(newStepsFor(index + 1).length).toBeLessThanOrEqual(2)
    }
  })

  it('rejects an invalid exercise index', () => {
    expect(() => activeStepsFor(0)).toThrow(/exercise index/)
    expect(() => activeStepsFor(1.5)).toThrow(/exercise index/)
    expect(() => newStepsFor(-1)).toThrow(/exercise index/)
  })

  it('gives the active steps before a step', () => {
    expect(previousActiveSteps(1, 'high_level_design')).toEqual(['functional_requirements'])
    expect(previousActiveSteps(1, 'functional_requirements')).toEqual([])
    expect(previousActiveSteps(3, 'data_model')).toEqual([
      'functional_requirements',
      'estimations',
      'api'
    ])
    // Not active: no context.
    expect(previousActiveSteps(1, 'api')).toEqual([])
  })

  it('recognizes step names', () => {
    expect(isProtocolStep('api')).toBe(true)
    expect(isProtocolStep('phase')).toBe(false)
    expect(isProtocolStep(3)).toBe(false)
  })
})

describe('nextHintLevel', () => {
  it('goes from nudge to direction to near-solution, then stops', () => {
    expect([0, 1, 2, 3, 4].map(nextHintLevel)).toEqual([1, 2, 3, null, null])
  })

  it('rejects an invalid count', () => {
    expect(() => nextHintLevel(-1)).toThrow()
  })
})
