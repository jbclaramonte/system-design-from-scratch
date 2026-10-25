import { describe, expect, it } from 'vitest'
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStepStatus,
  TopicStep
} from '../../../shared/learningPath'
import {
  canDeclareTopic,
  canForceUnlock,
  canLockAgain,
  canOpenExercise,
  filteredSections,
  forcedUnlockConfirmation,
  forcedUnlockNote,
  lockMessage,
  noNextStepText,
  prerequisiteText,
  progressText,
  sectionCounter,
  showsForcedUnlock,
  statusNote
} from './pathText'

const topicStep = (
  status: LearningPathStepStatus,
  lockedBy: TopicStep['lockedBy'] = null,
  changes: Partial<TopicStep> = {}
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
    mastery: 'not_started',
    declared: false,
    canUndoDeclaration: false,
    roundNumber: 1
  },
  status,
  lockedBy,
  forcedUnlock: false,
  ...changes
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
  forcedUnlock: false,
  rationale: 'Why.',
  ...changes
})

const ref = (title: string, status: LearningPathStepStatus = 'available') => ({
  slug: title.toLowerCase(),
  title,
  status
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
      'Every topic is mastered and every Design Exercise completed.'
    )
    expect(
      noNextStepText({ ...path(3, 3), steps: [exerciseStep([], { status: 'coming_soon' })] })
    ).toBe(
      'Every topic is mastered and every available Design Exercise completed. More Design Exercises are coming soon.'
    )
    expect(noNextStepText(path(0, 0))).toBe('No topics yet.')
  })
})

describe('filters and counters', () => {
  const inSection = (step: TopicStep, section: TopicStep['section']): TopicStep => ({
    ...step,
    section
  })
  const path: LearningPath = {
    steps: [
      inSection(topicStep('mastered'), 'foundations'),
      inSection(topicStep('mastered'), 'foundations'),
      inSection(topicStep('in_progress'), 'primer'),
      inSection(topicStep('limit_reached'), 'primer'),
      inSection(topicStep('skipped'), 'primer'),
      inSection(topicStep('locked'), 'primer'),
      inSection(topicStep('locked'), 'primer'),
      exerciseStep([], { status: 'completed' }),
      exerciseStep([ref('Cache')], { status: 'locked' }),
      exerciseStep([], { status: 'coming_soon' })
    ],
    nextStepKey: null,
    progress: {
      masteredTopics: 2,
      totalTopics: 7,
      percent: 28,
      unlockedExercises: 2,
      totalExercises: 3
    }
  }

  it('shows every section, or only the filtered one', () => {
    expect(filteredSections('all')).toEqual(['foundations', 'primer', 'design_exercises'])
    expect(filteredSections('primer')).toEqual(['primer'])
    expect(filteredSections('design_exercises')).toEqual(['design_exercises'])
  })

  it('counts mastered topics per section and completed Design Exercises', () => {
    expect(sectionCounter(path, 'foundations')).toBe('2/2 mastered')
    expect(sectionCounter(path, 'primer')).toBe('0/5 mastered')
    expect(sectionCounter(path, 'design_exercises')).toBe('1/3 completed')
  })
})

describe('status texts', () => {
  it('explains a topic at the Round Limit or skipped, and nothing else', () => {
    expect(statusNote(topicStep('limit_reached'))).toContain('Round Limit reached')
    expect(statusNote(topicStep('skipped'))).toContain('another angle')
    expect(statusNote(topicStep('in_progress'))).toBeNull()
    expect(statusNote(exerciseStep([], { status: 'locked' }))).toBeNull()
  })

  it('summarizes the prerequisites of a Design Exercise', () => {
    const prerequisites = [ref('Cache'), ref('DNS', 'mastered'), ref('Database', 'mastered')]
    expect(prerequisiteText(exerciseStep([ref('Cache')], { prerequisites }))).toBe(
      '2 of 3 prerequisites mastered'
    )
    expect(prerequisiteText(exerciseStep([]))).toBeNull()
  })
})

describe('Forced Unlock', () => {
  const cache = ref('Cache', 'in_progress')
  const forcedTopic = (status: LearningPathStepStatus) =>
    topicStep(status, cache, { forcedUnlock: true })

  it('offers "Unlock anyway" on a locked step only', () => {
    expect(canForceUnlock(topicStep('locked', cache))).toBe(true)
    expect(canForceUnlock(exerciseStep([ref('DNS')], { status: 'locked' }))).toBe(true)
    expect(canForceUnlock(topicStep('available'))).toBe(false)
    expect(canForceUnlock(exerciseStep([ref('DNS')]))).toBe(false)
  })

  it('offers "Lock again" while the forced step has no progress', () => {
    expect(canLockAgain(forcedTopic('available'))).toBe(true)
    expect(canLockAgain(forcedTopic('in_progress'))).toBe(false)
    expect(canLockAgain(topicStep('available'))).toBe(false)
  })

  it('marks an opened step, not a finished one', () => {
    expect(showsForcedUnlock(forcedTopic('available'))).toBe(true)
    expect(showsForcedUnlock(forcedTopic('in_progress'))).toBe(true)
    expect(showsForcedUnlock(forcedTopic('mastered'))).toBe(false)
    expect(showsForcedUnlock(topicStep('available'))).toBe(false)
  })

  it('says in the confirmation that the step opens without credit', () => {
    expect(forcedUnlockConfirmation(topicStep('locked', cache))).toBe(
      'Open Cache without credit? Cache will stay not mastered. Your progress does not change and the steps after it stay locked. You can lock it again until you start it.'
    )
    expect(
      forcedUnlockConfirmation(
        exerciseStep([ref('DNS'), ref('CDN')], {
          status: 'locked',
          lockedByExercise: { slug: 'pastebin', title: 'Pastebin' }
        })
      )
    ).toContain('DNS, CDN and Pastebin will stay not mastered.')
  })

  it('names what an opened step skipped', () => {
    expect(forcedUnlockNote(forcedTopic('available'))).toBe(
      'Opened without credit: Cache not mastered.'
    )
    expect(forcedUnlockNote(exerciseStep([], { forcedUnlock: true }))).toBe(
      'Opened without credit.'
    )
  })
})

describe('canDeclareTopic', () => {
  it('offers "I already know this" on an open topic that is not mastered', () => {
    for (const status of ['available', 'in_progress', 'skipped', 'limit_reached'] as const) {
      expect(canDeclareTopic(topicStep(status))).toBe(true)
    }
    for (const status of ['locked', 'mastered'] as const) {
      expect(canDeclareTopic(topicStep(status))).toBe(false)
    }
  })
})
