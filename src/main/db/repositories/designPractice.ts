import type { Database } from '../driver'
import type {
  DesignExercise,
  DesignFeedback,
  DesignFeedbackKind,
  DesignScene,
  Json,
  ProtocolStep
} from '../types'
import { fromFlag, fromJson, NOW, TIMESTAMP_COLUMNS, toFlag, toJson } from './mapping'

// Design exercises

export interface NewDesignExercise {
  slug: string
  title: string
  position: number
  grounded: boolean
  referenceSolutionSection?: string | null
}

interface DesignExerciseRow extends Omit<DesignExercise, 'grounded'> {
  grounded: number
}

const DESIGN_EXERCISE_COLUMNS = `id, slug, title, position, grounded,
  reference_solution_section AS referenceSolutionSection, ${TIMESTAMP_COLUMNS}`

const toDesignExercise = (row: DesignExerciseRow): DesignExercise => ({
  ...row,
  grounded: fromFlag(row.grounded)
})

export function createDesignExercise(db: Database, exercise: NewDesignExercise): DesignExercise {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO design_exercises (slug, title, position, grounded, reference_solution_section)
       VALUES ($slug, $title, $position, $grounded, $referenceSolutionSection)`
    )
    .run({
      slug: exercise.slug,
      title: exercise.title,
      position: exercise.position,
      grounded: toFlag(exercise.grounded),
      referenceSolutionSection: exercise.referenceSolutionSection ?? null
    })
  return getDesignExercise(db, lastInsertRowid)!
}

export function getDesignExercise(db: Database, id: number): DesignExercise | undefined {
  const row = db
    .prepare(`SELECT ${DESIGN_EXERCISE_COLUMNS} FROM design_exercises WHERE id = $id`)
    .get<DesignExerciseRow>({ id })
  return row && toDesignExercise(row)
}

/** Design exercises in Learning Path order. */
export function listDesignExercises(db: Database): DesignExercise[] {
  return db
    .prepare(`SELECT ${DESIGN_EXERCISE_COLUMNS} FROM design_exercises ORDER BY position, id`)
    .all<DesignExerciseRow>()
    .map(toDesignExercise)
}

// Design scenes

interface DesignSceneRow extends Omit<DesignScene, 'snapshot'> {
  snapshot: string
}

const DESIGN_SCENE_COLUMNS = `id, design_exercise_id AS designExerciseId, snapshot,
  ${TIMESTAMP_COLUMNS}`

/** Creates or replaces the tldraw snapshot of a design exercise. */
export function saveDesignScene(
  db: Database,
  designExerciseId: number,
  snapshot: Json
): DesignScene {
  db.prepare(
    `INSERT INTO design_scenes (design_exercise_id, snapshot) VALUES ($designExerciseId, $snapshot)
     ON CONFLICT (design_exercise_id)
     DO UPDATE SET snapshot = excluded.snapshot, updated_at = ${NOW}`
  ).run({ designExerciseId, snapshot: toJson(snapshot) })
  return getDesignScene(db, designExerciseId)!
}

export function getDesignScene(db: Database, designExerciseId: number): DesignScene | undefined {
  const row = db
    .prepare(
      `SELECT ${DESIGN_SCENE_COLUMNS} FROM design_scenes
       WHERE design_exercise_id = $designExerciseId`
    )
    .get<DesignSceneRow>({ designExerciseId })
  return row && { ...row, snapshot: fromJson(row.snapshot) }
}

// Design feedback

export interface NewDesignFeedback {
  designExerciseId: number
  kind: DesignFeedbackKind
  protocolStep: ProtocolStep | null
  content: Json
  grounded: boolean
}

interface DesignFeedbackRow extends Omit<DesignFeedback, 'content' | 'grounded'> {
  content: string
  grounded: number
}

const DESIGN_FEEDBACK_COLUMNS = `id, design_exercise_id AS designExerciseId, kind,
  protocol_step AS protocolStep, content, grounded, ${TIMESTAMP_COLUMNS}`

const toDesignFeedback = (row: DesignFeedbackRow): DesignFeedback => ({
  ...row,
  content: fromJson(row.content),
  grounded: fromFlag(row.grounded)
})

export function addDesignFeedback(db: Database, feedback: NewDesignFeedback): DesignFeedback {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO design_feedback (design_exercise_id, kind, protocol_step, content, grounded)
       VALUES ($designExerciseId, $kind, $protocolStep, $content, $grounded)`
    )
    .run({
      designExerciseId: feedback.designExerciseId,
      kind: feedback.kind,
      protocolStep: feedback.protocolStep,
      content: toJson(feedback.content),
      grounded: toFlag(feedback.grounded)
    })
  return toDesignFeedback(
    db
      .prepare(`SELECT ${DESIGN_FEEDBACK_COLUMNS} FROM design_feedback WHERE id = $id`)
      .get<DesignFeedbackRow>({ id: lastInsertRowid })!
  )
}

/** Feedback, hints and final review of a design exercise, oldest first. */
export function listDesignFeedback(db: Database, designExerciseId: number): DesignFeedback[] {
  return db
    .prepare(
      `SELECT ${DESIGN_FEEDBACK_COLUMNS} FROM design_feedback
       WHERE design_exercise_id = $designExerciseId ORDER BY id`
    )
    .all<DesignFeedbackRow>({ designExerciseId })
    .map(toDesignFeedback)
}
