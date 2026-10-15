import { describe, expect, it } from 'vitest'
import type { NotionScore } from '../../shared/quiz'
import {
  cannotChoose,
  cannotUndoDeclaration,
  cannotStartRound,
  deriveMastery,
  failedRoundsSinceLastPass,
  missedNotions,
  remediationAngle,
  type MasterySnapshot,
  type RoundSnapshot
} from './state'

const score = (id: number, earned: number, questionCount: number): NotionScore => ({
  id,
  slug: `n${id}`,
  title: `Notion ${id}`,
  questionCount,
  earned,
  scorePercent: (earned * 100) / questionCount,
  missed: earned < questionCount
})

/** Round `number` starts at minute `number` of a fixed hour, so declarations can sit between. */
const startedAt = (number: number): string =>
  new Date(Date.UTC(2026, 0, 1, 10, number)).toISOString()

/** Notion 1 always right; notion 2 missed unless `passed`. */
const completed = (number: number, passed: boolean): RoundSnapshot => ({
  id: number * 10,
  quizId: number,
  number,
  startedAt: startedAt(number),
  completed: true,
  passed,
  notionScores: [score(1, 2, 2), passed ? score(2, 2, 2) : score(2, 0, 2)]
})

const open = (number: number): RoundSnapshot => ({
  id: number * 10,
  quizId: number,
  number,
  startedAt: startedAt(number),
  completed: false,
  passed: null,
  notionScores: []
})

const snapshot = (changes: Partial<MasterySnapshot> = {}): MasterySnapshot => ({
  lessonReady: true,
  rounds: [],
  remediations: [],
  choices: [],
  declaredAt: null,
  masteryThreshold: 100,
  roundLimit: 3,
  ...changes
})

describe('deriveMastery', () => {
  it('starts with the lesson, not started until the lesson exists', () => {
    expect(deriveMastery(snapshot({ lessonReady: false }))).toMatchObject({
      status: 'not_started',
      step: { name: 'lesson', lessonReady: false },
      roundNumber: 1,
      failedRounds: 0
    })
    const ready = deriveMastery(snapshot())
    expect(ready).toMatchObject({ status: 'in_progress', step: { name: 'lesson' } })
    expect(cannotStartRound(ready.step)).toBeNull()
    expect(cannotStartRound(deriveMastery(snapshot({ lessonReady: false })).step)).toMatch(
      /Read the lesson/
    )
  })

  it('passes the first time: lesson, round 1, mastered', () => {
    const playing = deriveMastery(snapshot({ rounds: [open(1)] }))
    expect(playing).toMatchObject({
      status: 'in_progress',
      step: { name: 'round', roundId: 10, quizId: 1 },
      roundNumber: 1
    })

    const done = deriveMastery(snapshot({ rounds: [completed(1, true)] }))
    expect(done).toMatchObject({
      status: 'mastered',
      step: { name: 'mastered', roundId: 10 },
      failedRounds: 0,
      lastRoundId: 10
    })
    expect(cannotStartRound(done.step)).toMatch(/already mastered/)
  })

  it('fails, remediates the missed notions only, then passes', () => {
    const failed = snapshot({ rounds: [completed(1, false)] })
    const remediation = deriveMastery(failed)
    expect(remediation).toMatchObject({
      status: 'in_progress',
      roundNumber: 2,
      failedRounds: 1,
      step: { name: 'remediation', roundId: 10, anotherAngle: false }
    })
    if (remediation.step.name !== 'remediation') throw new Error('expected remediation')
    expect(remediation.step.targets).toEqual([
      {
        notion: { id: 2, slug: 'n2', title: 'Notion 2' },
        scorePercent: 0,
        angle: 'concrete_example',
        usedAngles: [],
        ready: false
      }
    ])
    expect(cannotStartRound(remediation.step)).toMatch(/Remediation Lessons/)

    const read = deriveMastery({ ...failed, remediations: [{ roundId: 10, notionId: 2 }] })
    if (read.step.name !== 'remediation') throw new Error('expected remediation')
    expect(read.step.targets[0]!.ready).toBe(true)
    expect(cannotStartRound(read.step)).toBeNull()

    const passed = deriveMastery(
      snapshot({
        rounds: [completed(1, false), completed(2, true)],
        remediations: [{ roundId: 10, notionId: 2 }]
      })
    )
    expect(passed).toMatchObject({ status: 'mastered', roundNumber: 3, failedRounds: 0 })
  })

  it('takes a new angle for each Remediation Lesson on the same notion', () => {
    const state = deriveMastery(
      snapshot({
        rounds: [completed(1, false), completed(2, false)],
        remediations: [{ roundId: 10, notionId: 2 }]
      })
    )
    if (state.step.name !== 'remediation') throw new Error('expected remediation')
    expect(state.step.targets[0]).toMatchObject({
      angle: 'analogy',
      usedAngles: ['concrete_example'],
      ready: false
    })
    expect([0, 1, 2, 3, 4].map(remediationAngle)).toEqual([
      'concrete_example',
      'analogy',
      'contrast',
      'guided_questions',
      'concrete_example'
    ])
  })

  describe('Round Limit', () => {
    const atLimit = snapshot({
      rounds: [completed(1, false), completed(2, false), completed(3, false)],
      remediations: [
        { roundId: 10, notionId: 2 },
        { roundId: 20, notionId: 2 }
      ]
    })

    it('is reached after N completed rounds below the threshold', () => {
      const state = deriveMastery(atLimit)
      expect(state).toMatchObject({
        status: 'limit_reached',
        step: { name: 'limit_reached', roundId: 30 },
        failedRounds: 3,
        roundNumber: 4
      })
      expect(cannotStartRound(state.step)).toMatch(/Round Limit/)
      expect(cannotChoose(state.step, 'skip')).toBeNull()
      expect(cannotChoose(state.step, 'another_angle')).toBeNull()
    })

    it('another angle: remediation with an angle never used on the notion', () => {
      const state = deriveMastery({
        ...atLimit,
        choices: [{ roundId: 30, choice: 'another_angle' }]
      })
      expect(state).toMatchObject({
        status: 'in_progress',
        step: { name: 'remediation', roundId: 30, anotherAngle: true }
      })
      if (state.step.name !== 'remediation') throw new Error('expected remediation')
      expect(state.step.targets[0]).toMatchObject({
        angle: 'contrast',
        usedAngles: ['concrete_example', 'analogy']
      })
    })

    it('another angle that fails again offers the choice again (never an endless loop)', () => {
      const state = deriveMastery({
        ...atLimit,
        rounds: [...atLimit.rounds, completed(4, false)],
        choices: [{ roundId: 30, choice: 'another_angle' }]
      })
      expect(state).toMatchObject({ status: 'limit_reached', failedRounds: 4 })
    })

    it('skip: the topic is skipped until the learner comes back with another angle', () => {
      const skipped = deriveMastery({ ...atLimit, choices: [{ roundId: 30, choice: 'skip' }] })
      expect(skipped).toMatchObject({ status: 'skipped', step: { name: 'skipped', roundId: 30 } })
      expect(cannotStartRound(skipped.step)).toMatch(/skipped/)
      expect(cannotChoose(skipped.step, 'skip')).not.toBeNull()
      expect(cannotChoose(skipped.step, 'another_angle')).toBeNull()

      const back = deriveMastery({
        ...atLimit,
        choices: [{ roundId: 30, choice: 'another_angle' }]
      })
      expect(back.step.name).toBe('remediation')
    })

    it('applies a changed Round Limit at once', () => {
      expect(deriveMastery({ ...atLimit, roundLimit: 4 }).status).toBe('in_progress')
      const twoFailed = snapshot({ rounds: [completed(1, false), completed(2, false)] })
      expect(deriveMastery(twoFailed).status).toBe('in_progress')
      expect(deriveMastery({ ...twoFailed, roundLimit: 2 }).status).toBe('limit_reached')
    })

    it('choices outside the limit are refused', () => {
      expect(cannotChoose({ name: 'lesson', lessonReady: true }, 'skip')).toMatch(/no Round Limit/)
    })
  })

  describe('abandoned rounds', () => {
    it('an open round is resumed with its number and never counts toward the limit', () => {
      const state = deriveMastery(
        snapshot({ rounds: [completed(1, false), completed(2, false), open(3)] })
      )
      expect(state).toMatchObject({
        status: 'in_progress',
        step: { name: 'round', roundId: 30, quizId: 3 },
        roundNumber: 3,
        failedRounds: 2
      })
      expect(cannotStartRound(state.step)).toBeNull()
    })

    it('ignores a stale open round older than the latest completed one', () => {
      const state = deriveMastery(snapshot({ rounds: [open(1), completed(2, false)] }))
      expect(state).toMatchObject({ step: { name: 'remediation', roundId: 20 }, roundNumber: 3 })
      expect(state.failedRounds).toBe(1)
    })
  })

  describe('topic status (#25)', () => {
    const status = (changes: Partial<MasterySnapshot>) => deriveMastery(snapshot(changes)).status

    it('is not_started without a lesson or a round', () => {
      expect(status({ lessonReady: false })).toBe('not_started')
    })

    it('is in_progress once the lesson is recorded, before any round', () => {
      expect(status({ lessonReady: true })).toBe('in_progress')
    })

    it('is in_progress with an open round, even without a recorded lesson', () => {
      expect(status({ lessonReady: false, rounds: [open(1)] })).toBe('in_progress')
    })

    it('is in_progress with an abandoned round, which never counts toward the limit', () => {
      // Round 1 left open, then round 2 opened: no completed round yet.
      const state = deriveMastery(snapshot({ lessonReady: false, rounds: [open(1), open(2)] }))
      expect(state).toMatchObject({ status: 'in_progress', step: { name: 'round', roundId: 20 } })
      expect(state.failedRounds).toBe(0)
    })

    it('is in_progress after a completed failed round', () => {
      expect(status({ rounds: [completed(1, false)] })).toBe('in_progress')
    })

    it('keeps mastered, skipped and limit_reached', () => {
      expect(status({ rounds: [completed(1, true)] })).toBe('mastered')
      const failed = [completed(1, false), completed(2, false), completed(3, false)]
      expect(status({ rounds: failed })).toBe('limit_reached')
      expect(status({ rounds: failed, choices: [{ roundId: 30, choice: 'skip' }] })).toBe('skipped')
    })
  })

  describe('Mastery Threshold changes between rounds', () => {
    // 3 questions: notion 1 on all three (2 right), notion 2 on one (right): quiz score 66.7%.
    const scores = [score(1, 2, 3), score(2, 1, 1)]
    const round = (passed: boolean): RoundSnapshot => ({
      ...completed(1, passed),
      notionScores: scores
    })

    it('keeps the stored outcome of a completed round', () => {
      // Passed at 60%; raising the threshold later does not unmaster the topic.
      expect(deriveMastery(snapshot({ rounds: [round(true)], masteryThreshold: 100 })).status).toBe(
        'mastered'
      )
      // Failed at 100%; lowering it later does not pass the round, it changes the targets.
      const state = deriveMastery(snapshot({ rounds: [round(false)], masteryThreshold: 60 }))
      expect(state.status).toBe('in_progress')
      if (state.step.name !== 'remediation') throw new Error('expected remediation')
      expect(state.step.targets.map((t) => t.notion.id)).toEqual([1])
    })
  })
})

describe('Declared Mastery', () => {
  // Between round 2 (minute 2) and round 4 (minute 4).
  const declaredAt = startedAt(3)
  const declared = (changes: Partial<MasterySnapshot> = {}) =>
    deriveMastery(snapshot({ declaredAt, ...changes }))

  it('makes a topic with no round mastered, flagged declared, without inventing a round', () => {
    expect(declared()).toMatchObject({
      status: 'mastered',
      declared: true,
      canDeclare: false,
      canUndoDeclaration: true,
      failedRounds: 0,
      lastRoundId: null,
      roundNumber: 1
    })
    // Without a declaration the topic is only in progress, and can be declared.
    expect(deriveMastery(snapshot())).toMatchObject({
      status: 'in_progress',
      declared: false,
      canDeclare: true,
      canUndoDeclaration: false
    })
  })

  it('is undone by removing the declaration', () => {
    expect(declared({ lessonReady: false }).status).toBe('mastered')
    expect(deriveMastery(snapshot({ declaredAt: null, lessonReady: false })).status).toBe(
      'not_started'
    )
  })

  it('keeps the loop step, so a declared topic can still be tested', () => {
    const state = declared({ lessonReady: false })
    expect(state.step).toEqual({ name: 'lesson', lessonReady: false })
    expect(cannotStartRound(declared().step)).toBeNull()
    const playing = declared({ rounds: [open(4)] })
    expect(playing).toMatchObject({ status: 'mastered', declared: true })
    expect(playing.step.name).toBe('round')
  })

  it('is not declared once a Round met the Mastery Threshold', () => {
    const state = declared({ rounds: [completed(4, true)] })
    expect(state).toMatchObject({ status: 'mastered', declared: false, canDeclare: false })
    expect(state.step.name).toBe('mastered')
    // Even if a later round failed: mastered once, mastered for good.
    const failedAfter = declared({ rounds: [completed(4, true), completed(5, false)] })
    expect(failedAfter).toMatchObject({ status: 'mastered', declared: false })
  })

  it('stays mastered and declared after a failed Round', () => {
    const state = declared({ rounds: [completed(4, false)] })
    expect(state).toMatchObject({ status: 'mastered', declared: true })
    expect(state.failedRounds).toBe(1)
    expect(state.step.name).toBe('remediation')
  })

  it('replaces the Round Limit and skipped states', () => {
    const atLimit = [completed(4, false), completed(5, false), completed(6, false)]
    expect(deriveMastery(snapshot({ rounds: atLimit })).status).toBe('limit_reached')
    expect(declared({ rounds: atLimit })).toMatchObject({ status: 'mastered', declared: true })
    const skipped = declared({ rounds: atLimit, choices: [{ roundId: 60, choice: 'skip' }] })
    expect(skipped).toMatchObject({ status: 'mastered', declared: true })
    expect(skipped.step.name).toBe('skipped')
  })

  it('refuses to declare a topic mastered by a Round, even one that regressed', () => {
    expect(deriveMastery(snapshot({ rounds: [completed(1, true)] })).canDeclare).toBe(false)
    const regressed = deriveMastery(snapshot({ rounds: [completed(1, true), completed(2, false)] }))
    expect(regressed.status).toBe('in_progress')
    expect(regressed.canDeclare).toBe(false)
  })

  describe('cannotUndoDeclaration', () => {
    it('allows it while no Round was started after the declaration', () => {
      expect(cannotUndoDeclaration(snapshot({ declaredAt }))).toBeNull()
      // Rounds played before the declaration do not count.
      expect(
        cannotUndoDeclaration(snapshot({ declaredAt, rounds: [completed(1, false), open(2)] }))
      ).toBeNull()
    })

    it('refuses it once a Round was started after, open or completed', () => {
      for (const round of [open(4), completed(4, false), completed(4, true)]) {
        const refused = cannotUndoDeclaration(snapshot({ declaredAt, rounds: [round] }))
        expect(refused).toMatch(/Round was played after the declaration/)
        expect(deriveMastery(snapshot({ declaredAt, rounds: [round] })).canUndoDeclaration).toBe(
          false
        )
      }
    })

    it('has nothing to undo without a declaration', () => {
      expect(cannotUndoDeclaration(snapshot())).toMatch(/no Declared Mastery/)
    })
  })
})

describe('missedNotions', () => {
  it('targets notions below the threshold', () => {
    const scores = [score(1, 1, 2), score(2, 3, 4), score(3, 1, 1)]
    expect(missedNotions(scores, 100).map((n) => n.id)).toEqual([1, 2])
    expect(missedNotions(scores, 60).map((n) => n.id)).toEqual([1])
  })

  it('falls back to notions with a wrong answer when none is below the threshold', () => {
    const scores = [score(1, 4, 5), score(2, 1, 1)]
    expect(missedNotions(scores, 70).map((n) => n.id)).toEqual([1])
  })
})

describe('failedRoundsSinceLastPass', () => {
  it('counts the completed failed rounds after the last passed one', () => {
    expect(failedRoundsSinceLastPass([])).toBe(0)
    expect(
      failedRoundsSinceLastPass([completed(1, false), completed(2, true), completed(3, false)])
    ).toBe(1)
  })
})
