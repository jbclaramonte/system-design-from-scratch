import { describe, expect, it } from 'vitest'
import type {
  DesignExerciseStep,
  LearningPath,
  LearningPathStep,
  LearningPathStepStatus,
  TopicStep
} from '../../../shared/learningPath'
import {
  buildPathView,
  nodeActionLabel,
  nodeIsOpenable,
  nodeStatusLabel,
  nodeTone,
  nodeView,
  sectionView,
  stripView
} from './pathView'

let id = 0
const topic = (
  slug: string,
  status: LearningPathStepStatus,
  changes: Partial<TopicStep> & { roundNumber?: number; title?: string; notionCount?: number } = {}
): TopicStep => {
  const { roundNumber = 1, title = slug.toUpperCase(), notionCount = 0, ...rest } = changes
  id += 1
  return {
    kind: 'topic',
    key: `topic:${slug}`,
    section: 'primer',
    topic: {
      id,
      slug,
      title,
      position: id,
      inFoundationsModule: false,
      grounded: true,
      notionCount,
      mastery: 'not_started',
      declared: false,
      canUndoDeclaration: false,
      roundNumber
    },
    status,
    lockedBy: null,
    forcedUnlock: false,
    ...rest
  }
}

const exercise = (
  slug: string,
  status: DesignExerciseStep['status'],
  changes: Partial<DesignExerciseStep> = {}
): DesignExerciseStep => ({
  kind: 'design_exercise',
  key: `design_exercise:${slug}`,
  section: 'design_exercises',
  slug,
  title: `Design ${slug}`,
  status,
  designExerciseId: status === 'coming_soon' ? null : 7,
  prerequisites: [],
  missingPrerequisites: [],
  lockedByExercise: null,
  forcedUnlock: false,
  rationale: 'Why.',
  ...changes
})

const pathOf = (steps: LearningPathStep[], nextStepKey: string | null = null): LearningPath => {
  const topics = steps.filter((step) => step.kind === 'topic')
  const mastered = topics.filter((step) => step.status === 'mastered').length
  return {
    steps,
    nextStepKey,
    progress: {
      masteredTopics: mastered,
      totalTopics: topics.length,
      percent: topics.length === 0 ? 0 : Math.floor((mastered / topics.length) * 100),
      unlockedExercises: 0,
      totalExercises: steps.length - topics.length
    }
  }
}

describe('node status', () => {
  it('says every status in words, with the Round of a topic in progress', () => {
    expect(nodeStatusLabel(topic('a', 'mastered'))).toBe('Mastered')
    expect(nodeStatusLabel(topic('a', 'in_progress', { roundNumber: 3 }))).toBe(
      'In progress, Round 3'
    )
    expect(nodeStatusLabel(topic('a', 'available'))).toBe('Not started')
    expect(nodeStatusLabel(topic('a', 'locked'))).toBe('Locked')
    expect(nodeStatusLabel(topic('a', 'skipped'))).toBe('To review')
    expect(nodeStatusLabel(topic('a', 'limit_reached'))).toBe('To review')
    expect(nodeStatusLabel(exercise('x', 'available'))).toBe('Ready to start')
    expect(nodeStatusLabel(exercise('x', 'in_progress'))).toBe('In progress')
    expect(nodeStatusLabel(exercise('x', 'completed'))).toBe('Completed')
    expect(nodeStatusLabel(exercise('x', 'coming_soon'))).toBe('Coming soon')
  })

  it('never uses a red tone: a step to review is attention, a locked one neutral', () => {
    expect(Object.values(nodeTone)).not.toContain('error')
    expect(nodeTone.limit_reached).toBe('attention')
    expect(nodeTone.skipped).toBe('attention')
    expect(nodeTone.locked).toBe('neutral')
    expect(nodeTone.mastered).toBe('mastered')
    expect(nodeTone.in_progress).toBe('progress')
  })

  it('offers the action of each openable status and none for a locked or coming-soon step', () => {
    expect(nodeActionLabel(topic('a', 'available'))).toBe('Start')
    expect(nodeActionLabel(topic('a', 'in_progress'))).toBe('Resume')
    expect(nodeActionLabel(topic('a', 'skipped'))).toBe('Come back')
    expect(nodeActionLabel(topic('a', 'limit_reached'))).toBe('Choose how to go on')
    expect(nodeActionLabel(topic('a', 'mastered'))).toBe('Review')
    expect(nodeActionLabel(exercise('x', 'completed'))).toBe('Review')
    expect(nodeActionLabel(topic('a', 'locked'))).toBeNull()
    expect(nodeActionLabel(exercise('x', 'coming_soon'))).toBeNull()
    expect(nodeIsOpenable(topic('a', 'locked'))).toBe(false)
    expect(nodeIsOpenable(exercise('x', 'coming_soon'))).toBe(false)
    expect(nodeIsOpenable(exercise('x', 'available'))).toBe(true)
    // An exercise without a row cannot be opened, whatever its status says.
    expect(nodeIsOpenable(exercise('x', 'available', { designExerciseId: null }))).toBe(false)
  })
})

describe('nodeView', () => {
  it('gathers title, status and action into the accessible name of the control', () => {
    const step = topic('cache', 'in_progress', { roundNumber: 2, title: 'Cache' })
    const view = nodeView(pathOf([step], step.key), step, 2)
    expect(view.accessibleName).toBe('Cache. In progress, Round 2. Resume')
    expect(view).toMatchObject({
      stepLabel: 'Step 03',
      current: true,
      action: 'Resume',
      tone: 'progress'
    })
  })

  it('names a locked node without an action', () => {
    const step = topic('cdn', 'locked', { title: 'CDN' })
    const view = nodeView(pathOf([step]), step, 0)
    expect(view.accessibleName).toBe('CDN. Locked')
    expect(view.action).toBeNull()
    expect(view.current).toBe(false)
  })

  it('adds what sets a step apart: Outside the primer, Declared, Forced Unlock', () => {
    const outside = topic('web', 'available', { title: 'Web' })
    outside.topic.grounded = false
    expect(nodeView(pathOf([outside]), outside, 0).accessibleName).toBe(
      'Web. Not started. Outside the primer. Start'
    )
    const declared = topic('dns', 'mastered', { title: 'DNS' })
    declared.topic.declared = true
    expect(nodeView(pathOf([declared]), declared, 0).accessibleName).toBe(
      'DNS. Mastered. Declared as already known. Review'
    )
    const forced = topic('cdn', 'available', { title: 'CDN', forcedUnlock: true })
    expect(nodeView(pathOf([forced]), forced, 0).accessibleName).toBe(
      'CDN. Not started. Opened by a Forced Unlock. Start'
    )
    const finished = topic('db', 'mastered', { title: 'DB', forcedUnlock: true })
    expect(nodeView(pathOf([finished]), finished, 0).accessibleName).toBe('DB. Mastered. Review')
  })

  it('keeps a long title whole, for the screen to wrap', () => {
    const title = 'A very long topic title '.repeat(10).trim()
    const step = topic('long', 'available', { title })
    expect(nodeView(pathOf([step]), step, 0).title).toBe(title)
  })

  it('details notions of a topic and prerequisites of an exercise', () => {
    const withNotions = topic('a', 'available', { notionCount: 4 })
    expect(nodeView(pathOf([withNotions]), withNotions, 0).detail).toBe('4 notions')
    const one = topic('b', 'available', { notionCount: 1 })
    expect(nodeView(pathOf([one]), one, 0).detail).toBe('1 notion')
    const none = topic('c', 'available')
    expect(nodeView(pathOf([none]), none, 0).detail).toBeNull()
    const ex = exercise('x', 'locked', {
      prerequisites: [
        { slug: 'a', title: 'A', status: 'mastered' },
        { slug: 'b', title: 'B', status: 'available' }
      ],
      missingPrerequisites: [{ slug: 'b', title: 'B', status: 'available' }]
    })
    expect(nodeView(pathOf([ex]), ex, 0).detail).toBe('1 of 2 prerequisites mastered')
  })
})

describe('sectionView', () => {
  const steps = [
    topic('a', 'mastered'),
    topic('b', 'mastered'),
    topic('c', 'in_progress'),
    topic('d', 'locked'),
    exercise('x', 'locked'),
    exercise('y', 'coming_soon')
  ]

  it('counts the steps of a section and states how far it is', () => {
    const path = pathOf(steps, 'topic:c')
    expect(sectionView(path, 'primer')).toMatchObject({
      title: 'Primer topics',
      counter: '2/4 mastered',
      done: 2,
      total: 4,
      state: 'in_progress',
      current: true
    })
    expect(sectionView(path, 'design_exercises')).toMatchObject({
      counter: '0/2 completed',
      state: 'not_started',
      current: false
    })
  })

  it('is complete once every step is done, and not started with nothing done', () => {
    const done = pathOf([topic('a', 'mastered'), topic('b', 'mastered')])
    expect(sectionView(done, 'primer').state).toBe('complete')
    const none = pathOf([topic('a', 'available'), topic('b', 'locked')])
    expect(sectionView(none, 'primer').state).toBe('not_started')
    const skipped = pathOf([topic('a', 'skipped'), topic('b', 'locked')])
    expect(sectionView(skipped, 'primer').state).toBe('in_progress')
  })

  it('numbers the nodes inside the section, in path order', () => {
    const path = pathOf(steps)
    expect(sectionView(path, 'primer').nodes.map((node) => node.stepLabel)).toEqual([
      'Step 01',
      'Step 02',
      'Step 03',
      'Step 04'
    ])
    expect(sectionView(path, 'design_exercises').nodes[0]!.stepLabel).toBe('Step 01')
  })
})

describe('stripView', () => {
  it('gives the global progress from the model', () => {
    const path = pathOf([topic('a', 'mastered'), topic('b', 'in_progress'), topic('c', 'locked')])
    const strip = stripView(path)
    expect(strip.progress).toEqual({
      mastered: 1,
      total: 3,
      percent: 33,
      text: '1 of 3 topics mastered (33%)'
    })
  })

  it('names the next milestone: the recommended step with its action', () => {
    const next = topic('b', 'in_progress', { title: 'Cache', roundNumber: 2 })
    const path = pathOf([topic('a', 'mastered'), next], next.key)
    const { nextMilestone } = stripView(path)
    expect(nextMilestone.text).toBe('Cache')
    expect(nextMilestone.step).toMatchObject({
      action: 'Resume',
      stepLabel: 'Step 02',
      current: true
    })
  })

  it('says why there is no next milestone', () => {
    expect(stripView(pathOf([topic('a', 'mastered')])).nextMilestone).toEqual({
      step: null,
      text: 'Every topic is mastered and every Design Exercise completed.'
    })
    expect(stripView(pathOf([])).nextMilestone.text).toBe('No topics yet.')
    expect(stripView(pathOf([topic('a', 'locked')])).nextMilestone.text).toBe(
      'Nothing to start right now.'
    )
  })

  it('points at a Design Exercise when the topics are done', () => {
    const next = exercise('x', 'available', { title: 'Design Pastebin' })
    const path = pathOf([topic('a', 'mastered'), next], next.key)
    expect(stripView(path).nextMilestone.step).toMatchObject({
      title: 'Design Pastebin',
      action: 'Start'
    })
  })
})

describe('buildPathView', () => {
  const path = pathOf(
    [topic('a', 'mastered'), topic('b', 'available'), exercise('x', 'locked')],
    'topic:b'
  )

  it('shows every section in path order, then one section per filter', () => {
    expect(buildPathView(path, 'all').sections.map((section) => section.section)).toEqual([
      'primer',
      'design_exercises'
    ])
    expect(buildPathView(path, 'design_exercises').sections.map((s) => s.section)).toEqual([
      'design_exercises'
    ])
    expect(buildPathView(path, 'primer').sections.map((s) => s.nodes.length)).toEqual([2])
  })

  it('leaves out a section without steps, such as the Foundations Module of an empty path', () => {
    expect(buildPathView(path, 'foundations').sections).toEqual([])
  })

  it('keeps the strip whatever the filter', () => {
    expect(buildPathView(path, 'design_exercises').strip).toEqual(stripView(path))
  })

  it('has exactly one current node, the recommended step', () => {
    const current = buildPathView(path, 'all').sections.flatMap((section) =>
      section.nodes.filter((node) => node.current).map((node) => node.key)
    )
    expect(current).toEqual(['topic:b'])
  })
})
