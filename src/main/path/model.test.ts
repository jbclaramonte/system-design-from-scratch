import { describe, expect, it } from 'vitest'
import type { DesignExerciseStep, TopicStep } from '../../shared/learningPath'
import type { TopicMastery } from '../../shared/mastery'
import {
  buildLearningPath,
  type DesignExerciseSlot,
  type LearningPathInput,
  type PathTopic
} from './model'

let nextId = 1
const topic = (
  slug: string,
  mastery: TopicMastery = 'not_started',
  changes: Partial<PathTopic> = {}
): PathTopic => ({
  id: nextId++,
  slug,
  title: slug.toUpperCase(),
  position: nextId,
  inFoundationsModule: false,
  grounded: true,
  notionCount: 0,
  mastery,
  declared: false,
  canUndoDeclaration: false,
  everMastered: mastery === 'mastered',
  ...changes
})
const foundation = (slug: string, mastery: TopicMastery = 'not_started') =>
  topic(slug, mastery, { inFoundationsModule: true, grounded: false })

const exercise = (
  slug: string,
  prerequisites: string[],
  implemented = false
): DesignExerciseSlot => ({ slug, title: slug, prerequisites, rationale: 'Why.', implemented })

const PRIMER = ['dns', 'cache', 'database']

const build = (topics: PathTopic[], changes: Partial<LearningPathInput> = {}) =>
  buildLearningPath({ topics, primerTopicSlugs: PRIMER, exercises: [], ...changes })

const topicSteps = (topics: PathTopic[], changes: Partial<LearningPathInput> = {}) =>
  build(topics, changes).steps.filter((step): step is TopicStep => step.kind === 'topic')
const statuses = (topics: PathTopic[], changes: Partial<LearningPathInput> = {}) =>
  topicSteps(topics, changes).map((step) => `${step.topic.slug}:${step.status}`)
const exerciseSteps = (input: Partial<LearningPathInput> & { topics: PathTopic[] }) =>
  build(input.topics, input).steps.filter(
    (step): step is DesignExerciseStep => step.kind === 'design_exercise'
  )

describe('buildLearningPath: order', () => {
  it('puts the Foundations Module first, then primer topics in primer order, then exercises', () => {
    const path = build(
      [topic('database'), topic('cache'), foundation('http'), topic('dns'), foundation('tcp')],
      { exercises: [exercise('pastebin', ['cache'])] }
    )
    expect(path.steps.map((step) => step.key)).toEqual([
      'topic:http',
      'topic:tcp',
      'topic:dns',
      'topic:cache',
      'topic:database',
      'design_exercise:pastebin'
    ])
    expect(path.steps.map((step) => step.section)).toEqual([
      'foundations',
      'foundations',
      'primer',
      'primer',
      'primer',
      'design_exercises'
    ])
  })

  it('works with zero Foundations Module topics: the first primer topic is available', () => {
    expect(statuses([topic('dns'), topic('cache'), topic('database')])).toEqual([
      'dns:available',
      'cache:locked',
      'database:locked'
    ])
  })

  it('leaves out unknown topics (neither primer nor Foundations Module, such as a dev fixture)', () => {
    const path = build([topic('dns'), topic('dev-fixture-cache', 'mastered')])
    expect(path.steps.map((step) => step.key)).toEqual(['topic:dns'])
    expect(path.progress.totalTopics).toBe(1)
  })

  it('skips primer slugs that have no topic in the database', () => {
    expect(statuses([topic('dns'), topic('database')])).toEqual([
      'dns:available',
      'database:locked'
    ])
  })

  it('is empty without topics', () => {
    const path = build([])
    expect(path.steps).toEqual([])
    expect(path.nextStepKey).toBeNull()
    expect(path.progress).toEqual({
      masteredTopics: 0,
      totalTopics: 0,
      percent: 0,
      unlockedExercises: 0,
      totalExercises: 0
    })
  })
})

describe('buildLearningPath: unlock rules', () => {
  it('unlocks a step only when the previous one is mastered, across sections', () => {
    expect(
      statuses([foundation('http', 'mastered'), topic('dns'), topic('cache'), topic('database')])
    ).toEqual(['http:mastered', 'dns:available', 'cache:locked', 'database:locked'])
  })

  it('names the previous topic as the lock reason', () => {
    const [, cache] = topicSteps([topic('dns', 'in_progress'), topic('cache')])
    expect(cache!.lockedBy).toEqual({ slug: 'dns', title: 'DNS', status: 'in_progress' })
    expect(topicSteps([topic('dns')])[0]!.lockedBy).toBeNull()
  })

  it('maps the mastery of an unlocked topic to its status', () => {
    expect(
      statuses([
        topic('dns', 'mastered'),
        topic('cache', 'mastered'),
        topic('database', 'in_progress')
      ])
    ).toEqual(['dns:mastered', 'cache:mastered', 'database:in_progress'])
  })

  it('does not unlock the next step after a skipped topic (strict)', () => {
    const steps = topicSteps([
      topic('dns', 'mastered'),
      topic('cache', 'skipped'),
      topic('database')
    ])
    expect(steps.map((step) => step.status)).toEqual(['mastered', 'skipped', 'locked'])
    expect(steps[2]!.lockedBy).toEqual({ slug: 'cache', title: 'CACHE', status: 'skipped' })
  })

  it('does not unlock the next step after a topic at the Round Limit', () => {
    expect(statuses([topic('dns', 'limit_reached'), topic('cache')])).toEqual([
      'dns:limit_reached',
      'cache:locked'
    ])
  })

  it('keeps a mastered topic mastered when a later round failed (no regression)', () => {
    const regressed = topic('dns', 'limit_reached', { everMastered: true })
    expect(statuses([regressed, topic('cache')])).toEqual(['dns:mastered', 'cache:available'])
  })

  it('does not depend on the Mastery Threshold: a round passed under an older threshold stays mastered', () => {
    // The threshold is applied when a round completes (rounds.passed); the path only reads the
    // result, so raising the threshold later never locks a step again.
    const passedUnderOldThreshold = topic('dns', 'mastered', { everMastered: true })
    expect(statuses([passedUnderOldThreshold, topic('cache')])).toEqual([
      'dns:mastered',
      'cache:available'
    ])
  })

  it('never locks a topic that already has progress (Foundations Module topics added before it)', () => {
    expect(
      statuses([foundation('http'), topic('dns', 'mastered'), topic('cache', 'in_progress')])
    ).toEqual(['http:available', 'dns:mastered', 'cache:in_progress'])
  })

  it('unlocks the step after a mastered topic even when an earlier one is not mastered', () => {
    expect(statuses([foundation('http'), topic('dns', 'mastered'), topic('cache')])).toEqual([
      'http:available',
      'dns:mastered',
      'cache:available'
    ])
  })
})

describe('buildLearningPath: next recommended step', () => {
  it('is the first unlocked topic not mastered', () => {
    expect(build([topic('dns', 'mastered'), topic('cache')]).nextStepKey).toBe('topic:cache')
  })

  it('points to a skipped topic so the way forward is never hidden', () => {
    expect(
      build([topic('dns', 'mastered'), topic('cache', 'skipped'), topic('database')]).nextStepKey
    ).toBe('topic:cache')
  })

  it('points to a topic at the Round Limit', () => {
    expect(build([topic('dns', 'limit_reached'), topic('cache')]).nextStepKey).toBe('topic:dns')
  })

  it('is an available Design Exercise once every topic is mastered', () => {
    const topics = [topic('dns', 'mastered'), topic('cache', 'mastered')]
    expect(
      build(topics, {
        exercises: [exercise('soon', ['cache']), exercise('pastebin', ['cache'], true)]
      }).nextStepKey
    ).toBe('design_exercise:pastebin')
  })

  it('is null when everything is mastered and the exercises are coming soon', () => {
    const topics = [topic('dns', 'mastered'), topic('cache', 'mastered')]
    expect(build(topics, { exercises: [exercise('pastebin', ['cache'])] }).nextStepKey).toBeNull()
  })
})

describe('buildLearningPath: Design Exercises', () => {
  it('shows exercises that are not implemented as coming soon, prerequisites met or not', () => {
    const steps = exerciseSteps({
      topics: [topic('dns', 'mastered'), topic('cache')],
      exercises: [exercise('a', ['dns']), exercise('b', ['cache'])]
    })
    expect(steps.map((step) => step.status)).toEqual(['coming_soon', 'coming_soon'])
    expect(steps.map((step) => step.missingPrerequisites.map((ref) => ref.slug))).toEqual([
      [],
      ['cache']
    ])
  })

  it('unlocks an implemented exercise when all its prerequisites are mastered, in any order', () => {
    const topics = [topic('dns'), topic('cache', 'mastered'), topic('database', 'mastered')]
    const steps = exerciseSteps({
      topics,
      exercises: [exercise('a', ['database', 'cache'], true), exercise('b', ['dns', 'cache'], true)]
    })
    expect(steps.map((step) => step.status)).toEqual(['available', 'locked'])
    expect(steps[1]!.missingPrerequisites).toEqual([
      { slug: 'dns', title: 'DNS', status: 'available' }
    ])
  })

  it('counts a skipped prerequisite as missing', () => {
    const [step] = exerciseSteps({
      topics: [topic('dns', 'mastered'), topic('cache', 'skipped')],
      exercises: [exercise('a', ['cache'], true)]
    })
    expect(step!.status).toBe('locked')
  })

  it('never unlocks on a prerequisite missing from the path', () => {
    const [step] = exerciseSteps({
      topics: [topic('dns', 'mastered')],
      exercises: [exercise('a', ['dns', 'unknown-topic'], true)]
    })
    expect(step!.status).toBe('locked')
    expect(step!.missingPrerequisites).toEqual([
      { slug: 'unknown-topic', title: 'unknown-topic', status: 'locked' }
    ])
  })
})

describe('buildLearningPath: Design Exercise progress and order', () => {
  const slot = (slug: string, changes: Partial<DesignExerciseSlot> = {}): DesignExerciseSlot => ({
    ...exercise(slug, ['dns'], true),
    designExerciseId: slug.length,
    ...changes
  })
  const mastered = [topic('dns', 'mastered')]

  it('locks an exercise until the previous one is completed', () => {
    const steps = exerciseSteps({
      topics: mastered,
      exercises: [slot('one'), slot('two', { previousExercise: 'one' })]
    })
    expect(steps.map((step) => step.status)).toEqual(['available', 'locked'])
    expect(steps[1]!.lockedByExercise).toEqual({ slug: 'one', title: 'one' })
    expect(steps[1]!.missingPrerequisites).toEqual([])
  })

  it('shows in_progress once a step was submitted, completed once reviewed, and unlocks the next', () => {
    const steps = (progress: DesignExerciseSlot['progress']) =>
      exerciseSteps({
        topics: mastered,
        exercises: [slot('one', { progress }), slot('two', { previousExercise: 'one' })]
      }).map((step) => step.status)
    expect(steps('in_progress')).toEqual(['in_progress', 'locked'])
    expect(steps('completed')).toEqual(['completed', 'available'])
  })

  it('never locks a started or completed exercise again', () => {
    const steps = exerciseSteps({
      topics: [topic('dns')],
      exercises: [
        slot('one', { progress: 'completed' }),
        slot('two', { previousExercise: 'missing', progress: 'in_progress' })
      ]
    })
    expect(steps.map((step) => step.status)).toEqual(['completed', 'in_progress'])
  })

  it('counts a previous exercise missing from the path as not completed', () => {
    const [step] = exerciseSteps({
      topics: mastered,
      exercises: [slot('two', { previousExercise: 'one' })]
    })
    expect(step!.status).toBe('locked')
    expect(step!.lockedByExercise).toEqual({ slug: 'one', title: 'one' })
  })

  it('gives no id to an exercise that is not implemented', () => {
    const [step] = exerciseSteps({
      topics: mastered,
      exercises: [slot('one', { implemented: false, progress: 'completed' })]
    })
    expect(step).toMatchObject({ status: 'coming_soon', designExerciseId: null })
  })

  it('recommends a topic first, then the first exercise available or in progress', () => {
    const path = (topics: PathTopic[], progress: DesignExerciseSlot['progress']) =>
      build(topics, {
        exercises: [slot('one', { progress }), slot('two', { previousExercise: 'one' })]
      }).nextStepKey
    expect(path([topic('dns', 'mastered'), topic('cache')], undefined)).toBe('topic:cache')
    expect(path(mastered, undefined)).toBe('design_exercise:one')
    expect(path(mastered, 'in_progress')).toBe('design_exercise:one')
    expect(path(mastered, 'completed')).toBe('design_exercise:two')
  })
})

describe('buildLearningPath: progress', () => {
  it('counts mastered topics and unlocked exercises', () => {
    const path = build(
      [foundation('http', 'mastered'), topic('dns', 'mastered'), topic('cache', 'skipped')],
      { exercises: [exercise('a', ['dns']), exercise('b', ['cache'])] }
    )
    expect(path.progress).toEqual({
      masteredTopics: 2,
      totalTopics: 3,
      percent: 66,
      unlockedExercises: 1,
      totalExercises: 2
    })
  })
})

describe('buildLearningPath: Forced Unlock', () => {
  const locked = [topic('dns', 'in_progress'), topic('cache'), topic('database')]

  it('opens a locked topic as available with the flag, and keeps what was skipped', () => {
    const steps = topicSteps(locked, { forcedUnlocks: ['topic:database'] })
    expect(steps.map((step) => `${step.topic.slug}:${step.status}:${step.forcedUnlock}`)).toEqual([
      'dns:in_progress:false',
      'cache:locked:false',
      'database:available:true'
    ])
    // The reason stays available to explain what was skipped.
    expect(steps[2]!.lockedBy).toEqual({ slug: 'cache', title: 'CACHE', status: 'locked' })
  })

  it('opens that one step only: the next topic stays locked', () => {
    expect(statuses(locked, { forcedUnlocks: ['topic:cache'] })).toEqual([
      'dns:in_progress',
      'cache:available',
      'database:locked'
    ])
  })

  it('has no effect on an unlocked step, a missing step or a mastered previous topic', () => {
    const open = [topic('dns', 'mastered'), topic('cache')]
    const [dns, cache] = topicSteps(open, {
      forcedUnlocks: ['topic:dns', 'topic:cache', 'topic:x']
    })
    expect(dns).toMatchObject({ status: 'mastered', forcedUnlock: false })
    expect(cache).toMatchObject({ status: 'available', forcedUnlock: false, lockedBy: null })
  })

  it('keeps the own status of a forced topic that was started, and never locks it again', () => {
    const steps = topicSteps([topic('dns'), topic('cache', 'in_progress'), topic('database')], {
      forcedUnlocks: ['topic:cache']
    })
    expect(steps[1]).toMatchObject({ status: 'in_progress', forcedUnlock: true })
    expect(steps[2]!.status).toBe('locked')
  })

  it('unlocks an implemented exercise and keeps its missing prerequisites', () => {
    const [step] = exerciseSteps({
      topics: [topic('dns', 'mastered'), topic('cache')],
      exercises: [exercise('a', ['dns', 'cache'], true)],
      forcedUnlocks: ['design_exercise:a']
    })
    expect(step).toMatchObject({ status: 'available', forcedUnlock: true })
    expect(step!.missingPrerequisites.map((ref) => ref.slug)).toEqual(['cache'])
  })

  it('unlocks an exercise whose previous exercise is not completed', () => {
    const slot = (slug: string, previousExercise: string | null): DesignExerciseSlot => ({
      ...exercise(slug, ['dns'], true),
      previousExercise,
      designExerciseId: slug.length
    })
    const steps = exerciseSteps({
      topics: [topic('dns', 'mastered')],
      exercises: [slot('one', null), slot('two', 'one'), slot('three', 'two')],
      forcedUnlocks: ['design_exercise:three']
    })
    expect(steps.map((step) => `${step.status}:${step.forcedUnlock}`)).toEqual([
      'available:false',
      'locked:false',
      'available:true'
    ])
    expect(steps[2]!.lockedByExercise).toEqual({ slug: 'two', title: 'two' })
  })

  it('keeps the status of a started exercise, and ignores a coming soon one', () => {
    const steps = exerciseSteps({
      topics: [topic('dns')],
      exercises: [
        { ...exercise('a', ['dns'], true), progress: 'in_progress', designExerciseId: 1 },
        exercise('b', ['dns'], false)
      ],
      forcedUnlocks: ['design_exercise:a', 'design_exercise:b']
    })
    expect(steps.map((step) => `${step.status}:${step.forcedUnlock}`)).toEqual([
      'in_progress:true',
      'coming_soon:false'
    ])
  })

  it('does not count as mastery and does not change the recommended step', () => {
    const topics = [topic('dns', 'in_progress'), topic('cache'), topic('database')]
    const exercises = [exercise('a', ['dns', 'cache', 'database'], true)]
    const without = build(topics, { exercises })
    const forced = build(topics, {
      exercises,
      forcedUnlocks: ['topic:cache', 'topic:database', 'design_exercise:a']
    })
    expect(forced.progress).toEqual(without.progress)
    expect(forced.nextStepKey).toBe(without.nextStepKey)
    expect(forced.nextStepKey).toBe('topic:dns')
    expect(forced.progress.masteredTopics).toBe(0)
    expect(forced.progress.unlockedExercises).toBe(0)
  })

  it('does not recommend a forced exercise when it is the only step left to open', () => {
    const topics = [topic('dns', 'mastered')]
    const exercises = [exercise('a', ['dns', 'unknown'], true)]
    expect(build(topics, { exercises }).nextStepKey).toBeNull()
    expect(
      build(topics, { exercises, forcedUnlocks: ['design_exercise:a'] }).nextStepKey
    ).toBeNull()
  })
})

describe('buildLearningPath: Declared Mastery', () => {
  /** A topic mastered by declaration: mastered, no Round passed. */
  const declared = (slug: string) =>
    topic(slug, 'mastered', { declared: true, canUndoDeclaration: true, everMastered: false })

  it('counts a declared topic as mastered: the next topic unlocks', () => {
    const steps = topicSteps([declared('dns'), topic('cache'), topic('database')])
    expect(steps.map((step) => `${step.topic.slug}:${step.status}`)).toEqual([
      'dns:mastered',
      'cache:available',
      'database:locked'
    ])
    // The flag travels with the topic, so the screens can mark it.
    expect(steps[0]!.topic).toMatchObject({ declared: true, canUndoDeclaration: true })
    expect(steps[1]!.topic.declared).toBe(false)
  })

  it('counts it in the progress and in the exercise prerequisites', () => {
    const path = build([declared('dns'), declared('cache'), topic('database', 'mastered')], {
      exercises: [exercise('a', ['dns', 'cache', 'database'], true)]
    })
    expect(path.progress).toMatchObject({
      masteredTopics: 3,
      totalTopics: 3,
      percent: 100,
      unlockedExercises: 1
    })
    const [step] = path.steps.filter((s): s is DesignExerciseStep => s.kind === 'design_exercise')
    expect(step).toMatchObject({
      status: 'available',
      missingPrerequisites: [],
      forcedUnlock: false
    })
    expect(path.nextStepKey).toBe('design_exercise:a')
  })

  it('recommends the topic after a declared one', () => {
    expect(build([declared('dns'), topic('cache')]).nextStepKey).toBe('topic:cache')
  })
})
