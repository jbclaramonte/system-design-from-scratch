import { describe, expect, it } from 'vitest'
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStepStatus,
  TopicStep
} from '../../../shared/learningPath'
import {
  actionLabel,
  canOpenExercise,
  continueLabel,
  filteredSections,
  lockMessage,
  noNextStepText,
  prerequisiteText,
  priorityDetails,
  progressText,
  sectionCounter,
  statusLabel,
  statusNote,
  topicCounters
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

describe('actionLabel', () => {
  it('is the short form of the continue label', () => {
    expect(actionLabel(topicStep('available'))).toBe('Start')
    expect(actionLabel(topicStep('in_progress'))).toBe('Continue')
    expect(actionLabel(topicStep('skipped'))).toBe('Come back')
    expect(actionLabel(topicStep('limit_reached'))).toBe('Choose how to go on')
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

  it('counts the topics of the hero card, Design Exercises left out', () => {
    expect(topicCounters(path)).toEqual({
      mastered: 2,
      inProgress: 1,
      retryRequired: 1,
      locked: 2
    })
  })

  it('counts mastered topics per section and completed Design Exercises', () => {
    expect(sectionCounter(path, 'foundations')).toBe('2/2 mastered')
    expect(sectionCounter(path, 'primer')).toBe('0/5 mastered')
    expect(sectionCounter(path, 'design_exercises')).toBe('1/3 completed')
  })
})

describe('status texts', () => {
  it('calls a startable Design Exercise ready, a topic not started', () => {
    expect(statusLabel(exerciseStep([], { status: 'available' }))).toBe('Ready to start')
    expect(statusLabel(exerciseStep([], { status: 'locked' }))).toBe('Locked')
    expect(statusLabel(topicStep('available'))).toBe('Not started')
    expect(statusLabel(topicStep('limit_reached'))).toBe('Round Limit reached')
  })

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

  it('details the priority step with real data only', () => {
    expect(priorityDetails(topicStep('available'))).toEqual(['Primer topic'])
    const withNotions = topicStep('in_progress')
    withNotions.topic.notionCount = 5
    expect(priorityDetails(withNotions)).toEqual(['Primer topic', '5 notions'])
    expect(priorityDetails(exerciseStep([], { rationale: 'A cache.' }))).toEqual(['A cache.'])
  })
})
