import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { listDesignExercises } from '../db/repositories/designPractice'
import {
  DESIGN_EXERCISE_PREREQUISITES,
  IMPLEMENTED_DESIGN_EXERCISES
} from '../path/designExercisePrerequisites'
import { activeStepsFor } from '../../shared/protocol'
import {
  DESIGN_EXERCISES,
  previousDesignExercise,
  seedDesignExercises,
  type DesignExerciseDefinition
} from './designExercises'
import { exerciseIndexOf } from './exercises'

const corpus = loadCorpus(corpusPath(process.cwd()))

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[*_`#>()[\]:;,.!?'"«»]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Length in words of the longest run of consecutive words found in both texts. */
function longestSharedSpan(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  let best = 0
  const previous = new Array<number>(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let diagonal = 0
    for (let j = 1; j <= y.length; j++) {
      const above = previous[j]!
      previous[j] = x[i - 1] === y[j - 1] ? diagonal + 1 : 0
      best = Math.max(best, previous[j]!)
      diagonal = above
    }
  }
  return best
}

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

describe('DESIGN_EXERCISES', () => {
  it('references existing Reference Solutions, with unique slugs and order indexes 1, 2...', () => {
    expect(DESIGN_EXERCISES.map((e) => e.orderIndex)).toEqual(
      DESIGN_EXERCISES.map((_, index) => index + 1)
    )
    expect(new Set(DESIGN_EXERCISES.map((e) => e.slug)).size).toBe(DESIGN_EXERCISES.length)
    for (const exercise of DESIGN_EXERCISES) {
      expect(corpus.getReferenceSolution(exercise.referenceSolutionId)).toBeDefined()
      expect(exercise.slug).toBe(exercise.referenceSolutionId)
    }
  })

  it('starts with Pastebin (2 active steps), then Twitter (adds estimations)', () => {
    expect(DESIGN_EXERCISES.map((e) => e.slug)).toEqual(['pastebin', 'twitter'])
    expect(activeStepsFor(1)).toEqual(['functional_requirements', 'high_level_design'])
    expect(activeStepsFor(2)).toEqual([
      'functional_requirements',
      'estimations',
      'high_level_design'
    ])
  })

  it('is the implemented part of the Learning Path, first and in order', () => {
    expect(IMPLEMENTED_DESIGN_EXERCISES).toEqual(DESIGN_EXERCISES.map((e) => e.slug))
    expect(
      DESIGN_EXERCISE_PREREQUISITES.slice(0, DESIGN_EXERCISES.length).map(
        (e) => e.referenceSolutionId
      )
    ).toEqual(DESIGN_EXERCISES.map((e) => e.slug))
  })

  it('asks each exercise for at least the prerequisites of the previous one', () => {
    const prerequisitesOf = (slug: string) =>
      DESIGN_EXERCISE_PREREQUISITES.find((e) => e.referenceSolutionId === slug)!.prerequisites
    for (const exercise of DESIGN_EXERCISES.slice(1)) {
      const previous = previousDesignExercise(exercise.slug)!
      expect(previous.orderIndex).toBe(exercise.orderIndex - 1)
      expect(prerequisitesOf(exercise.slug)).toEqual(
        expect.arrayContaining([...prerequisitesOf(previous.slug)])
      )
    }
    expect(previousDesignExercise('pastebin')).toBeNull()
    expect(previousDesignExercise('mint')).toBeNull()
  })

  describe.each(DESIGN_EXERCISES.map((e) => [e.slug, e] as const))(
    'problem statement of %s',
    (_slug, exercise: DesignExerciseDefinition) => {
      const solution = corpus.getReferenceSolution(exercise.referenceSolutionId)!
      const step1 = solution.steps.find((step) => step.id.startsWith('step-1-'))!

      it('is short French text with no number', () => {
        const sentences = exercise.problemStatement.split(/(?<=[.!?])\s+/)
        expect(sentences.length).toBeGreaterThanOrEqual(2)
        expect(sentences.length).toBeLessThanOrEqual(4)
        expect(exercise.problemStatement).toMatch(/\btu\b/i)
        expect(exercise.problemStatement).not.toMatch(/\d/)
      })

      it('shares no verbatim span with the Reference Solution use cases and constraints', () => {
        for (const reference of [solution.useCases, solution.constraints, step1.markdown]) {
          expect(longestSharedSpan(exercise.problemStatement, reference)).toBeLessThan(4)
        }
      })
    }
  )

  it('detects a statement copied from the reference (test of the leak check)', () => {
    const solution = corpus.getReferenceSolution('pastebin')!
    expect(
      longestSharedSpan(
        'Design it. User enters a block of text and gets a randomly generated link.',
        solution.useCases
      )
    ).toBeGreaterThanOrEqual(4)
  })
})

describe('seedDesignExercises', () => {
  it('inserts the catalogue once, grounded, positioned by order index', () => {
    expect(seedDesignExercises(db, corpus)).toBe(2)
    expect(seedDesignExercises(db, corpus)).toBe(0)
    const rows = listDesignExercises(db)
    expect(rows.map((r) => [r.slug, r.position, r.grounded, r.referenceSolutionSection])).toEqual([
      ['pastebin', 1, true, 'pastebin'],
      ['twitter', 2, true, 'twitter']
    ])
    expect(rows[0]!.problemStatement).toBe(DESIGN_EXERCISES[0]!.problemStatement)
    expect(rows.map((row) => exerciseIndexOf(rows, row))).toEqual([1, 2])
  })

  it('never updates an existing row, and inserts a new exercise only', () => {
    seedDesignExercises(db, corpus, DESIGN_EXERCISES.slice(0, 1))
    const [first] = listDesignExercises(db)
    const changed = DESIGN_EXERCISES.map((e) => ({ ...e, title: `${e.title} (changed)` }))
    expect(seedDesignExercises(db, corpus, changed)).toBe(1)
    const rows = listDesignExercises(db)
    expect(rows[0]).toEqual(first)
    expect(rows[1]!.title).toBe(`${DESIGN_EXERCISES[1]!.title} (changed)`)
  })

  it('refuses an exercise whose Reference Solution is not in the corpus, inserting nothing', () => {
    const broken = [...DESIGN_EXERCISES, { ...DESIGN_EXERCISES[0]!, slug: 'x', orderIndex: 3 }]
    broken[2]!.referenceSolutionId = 'nope'
    expect(() => seedDesignExercises(db, corpus, broken)).toThrow(/nope/)
    expect(listDesignExercises(db)).toEqual([])
  })

  it('keeps the dev fixtures out of the rank of real exercises', () => {
    seedDesignExercises(db, corpus)
    const rows = listDesignExercises(db)
    const twitter = rows.find((r) => r.slug === 'twitter')!
    expect(exerciseIndexOf([{ id: 99, slug: 'dev-protocol-3' }, ...rows], twitter)).toBe(2)
  })
})
