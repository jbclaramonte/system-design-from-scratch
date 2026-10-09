// Which exercise index a Design Exercise has (it decides its active Protocol Steps), and the dev
// fixture exercises used until the real catalogue exists (#15).
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { createDesignExercise, listDesignExercises } from '../db/repositories/designPractice'
import type { DesignExercise } from '../db/types'

/** Slug prefix of dev-only exercises: they never count in the Learning Path rank. */
export const DEV_EXERCISE_SLUG_PREFIX = 'dev-'
const DEV_PROTOCOL_SLUG = /^dev-protocol-(\d+)$/

/** Reference Solution of the dev fixture: the primer's Pastebin (or Bit.ly) solution. */
export const DEV_PROTOCOL_REFERENCE_SOLUTION = 'pastebin'

/** A deliberately short brief: scoping the problem is the learner's first step. */
export const DEV_PROTOCOL_PROBLEM_STATEMENT =
  'Design a service like Pastebin.com (or Bit.ly): anyone can paste a block of text and get a short random link to share it; whoever opens the link sees the text.'

/**
 * 1-based index of an exercise among the Design Exercises of the Learning Path (`exercises` in
 * path order, as `listDesignExercises` returns them). Dev exercises are not ranked: a
 * `dev-protocol-<n>` fixture plays exercise n, any other dev exercise plays exercise 1.
 */
export function exerciseIndexOf(
  exercises: readonly Pick<DesignExercise, 'id' | 'slug'>[],
  exercise: Pick<DesignExercise, 'id' | 'slug'>
): number {
  const dev = DEV_PROTOCOL_SLUG.exec(exercise.slug)
  if (dev) return Math.max(1, Number(dev[1]))
  if (exercise.slug.startsWith(DEV_EXERCISE_SLUG_PREFIX)) return 1
  const ranked = exercises.filter(({ slug }) => !slug.startsWith(DEV_EXERCISE_SLUG_PREFIX))
  const index = ranked.findIndex(({ id }) => id === exercise.id)
  if (index < 0) throw new Error(`Design exercise ${exercise.id} is not in the list.`)
  return index + 1
}

/** Gets or creates the dev fixture exercise that plays exercise `exerciseIndex`. */
export function openDevProtocolExercise(
  db: Database,
  corpus: Corpus,
  exerciseIndex: number
): DesignExercise {
  if (!Number.isSafeInteger(exerciseIndex) || exerciseIndex < 1 || exerciseIndex > 99) {
    throw new Error(`Invalid exercise index: ${exerciseIndex}`)
  }
  const solution = corpus.getReferenceSolution(DEV_PROTOCOL_REFERENCE_SOLUTION)
  if (!solution) throw new Error('The Source Corpus has no Pastebin Reference Solution.')
  const slug = `dev-protocol-${exerciseIndex}`
  return (
    listDesignExercises(db).find((exercise) => exercise.slug === slug) ??
    createDesignExercise(db, {
      slug,
      title: `${solution.title} (dev, exercise ${exerciseIndex})`,
      position: 0,
      grounded: true,
      referenceSolutionSection: solution.id,
      problemStatement: DEV_PROTOCOL_PROBLEM_STATEMENT
    })
  )
}
