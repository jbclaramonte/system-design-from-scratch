import { describe, expect, it } from 'vitest'
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStepStatus,
  TopicStep
} from '../../../shared/learningPath'
import {
  canOpenExercise,
  continueLabel,
  lockMessage,
  noNextStepText,
  progressText
} from './pathText'

const topicStep = (
  status: LearningPathStepStatus,
  lockedBy: TopicStep['lockedBy'] = null
): TopicStep => ({
  kind: 'topic',
  key: 'topic:cache',
  section: 'primer',
  topic: {
    id: 1,
    slug: 'cache',
    title: 'Cache',
    position: 1000,
    inFoundationsModule: false,
    grounded: true,
    notionCount: 0,
    mastery: 'not_started'
  },
  status,
  lockedBy
})

const exerciseStep = (
  missing: DesignExerciseStep['missingPrerequisites'],
  changes: Partial<DesignExerciseStep> = {}
): DesignExerciseStep => ({
  kind: 'design_exercise',
  key: 'design_exercise:pastebin',
  section: 'design_exercises',
  slug: 'pastebin',
  title: 'Design Pastebin',
  status: 'coming_soon',
  designExerciseId: null,
  prerequisites: missing,
  missingPrerequisites: missing,
  lockedByExercise: null,
  rationale: 'Why.',
  ...changes
})

const ref = (title: string, status: LearningPathStepStatus = 'available') => ({
  slug: title.toLowerCase(),
  title,
  status
})

describe('continueLabel', () => {
  it('says start, continue or come back depending on the status', () => {
    expect(continueLabel(topicStep('available'))).toBe('Start: Cache')
    expect(continueLabel(topicStep('in_progress'))).toBe('Continue: Cache')
    expect(continueLabel(topicStep('skipped'))).toBe('Come back to Cache with another angle')
    expect(continueLabel(topicStep('limit_reached'))).toBe('Choose how to go on with Cache')
  })
})

describe('lockMessage', () => {
  it('names the topic to master first, and why it does not unlock', () => {
    expect(lockMessage(topicStep('locked', ref('DNS')))).toBe('Master DNS first.')
    expect(lockMessage(topicStep('locked', ref('DNS', 'skipped')))).toBe(
      'Master DNS first. It was skipped: come back to it with another angle.'
    )
    expect(lockMessage(topicStep('locked', ref('DNS', 'limit_reached')))).toBe(
      'Master DNS first. It reached the Round Limit: try another angle.'
    )
    expect(lockMessage(topicStep('available'))).toBeNull()
  })

  it('lists the missing prerequisites of a Design Exercise', () => {
    expect(lockMessage(exerciseStep([ref('Cache'), ref('Database'), ref('DNS')]))).toBe(
      'Master Cache, Database and DNS first.'
    )
    expect(lockMessage(exerciseStep([]))).toBeNull()
  })

  it('names the Design Exercise to complete first', () => {
    const previous = { slug: 'pastebin', title: 'Design Pastebin' }
    expect(lockMessage(exerciseStep([], { status: 'locked', lockedByExercise: previous }))).toBe(
      'Complete Design Pastebin first.'
    )
    expect(
      lockMessage(exerciseStep([ref('Cache')], { status: 'locked', lockedByExercise: previous }))
    ).toBe('Master Cache first. Complete Design Pastebin first.')
    expect(lockMessage(exerciseStep([], { status: 'available' }))).toBeNull()
  })
})

describe('canOpenExercise', () => {
  it('opens an available, started or completed exercise that has a row', () => {
    expect(canOpenExercise(exerciseStep([], { status: 'available', designExerciseId: 1 }))).toBe(
      true
    )
    expect(canOpenExercise(exerciseStep([], { status: 'completed', designExerciseId: 1 }))).toBe(
      true
    )
    expect(canOpenExercise(exerciseStep([], { status: 'locked', designExerciseId: 1 }))).toBe(false)
    expect(canOpenExercise(exerciseStep([], { status: 'available' }))).toBe(false)
  })
})

describe('progress texts', () => {
  const path = (masteredTopics: number, totalTopics: number): LearningPath => ({
    steps: [],
    nextStepKey: null,
    progress: { masteredTopics, totalTopics, percent: 0, unlockedExercises: 0, totalExercises: 0 }
  })

  it('summarizes the progress and the end of the path', () => {
    expect(progressText({ ...path(2, 3).progress, percent: 66 })).toBe(
      '2 of 3 topics mastered (66%)'
    )
    expect(noNextStepText(path(3, 3))).toBe(
      'Every topic is mastered and every available Design Exercise completed. More Design Exercises are coming soon.'
    )
    expect(noNextStepText(path(0, 0))).toBe('No topics yet.')
  })
})
