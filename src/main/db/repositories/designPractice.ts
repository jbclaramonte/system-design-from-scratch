import type { Database } from '../driver'
import type {
  DesignExercise,
  DesignFeedback,
  DesignFeedbackKind,
  DesignScene,
  Json,
  ProtocolStep,
  ProtocolStepDraft,
  ProtocolStepEncounter,
  ProtocolStepSubmission,
  SubmissionStatus
} from '../types'
import { fromFlag, fromJson, NOW, TIMESTAMP_COLUMNS, toFlag, toJson } from './mapping'

// Design exercises

export interface NewDesignExercise {
  slug: string
  title: string
  position: number
  grounded: boolean
  referenceSolutionSection?: string | null
  problemStatement?: string | null
}

interface DesignExerciseRow extends Omit<DesignExercise, 'grounded'> {
  grounded: number
}

const DESIGN_EXERCISE_COLUMNS = `id, slug, title, position, grounded,
  reference_solution_section AS referenceSolutionSection, problem_statement AS problemStatement,
  ${TIMESTAMP_COLUMNS}`

const toDesignExercise = (row: DesignExerciseRow): DesignExercise => ({
  ...row,
  grounded: fromFlag(row.grounded)
})

export function createDesignExercise(db: Database, exercise: NewDesignExercise): DesignExercise {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO design_exercises
         (slug, title, position, grounded, reference_solution_section, problem_statement)
       VALUES ($slug, $title, $position, $grounded, $referenceSolutionSection, $problemStatement)`
    )
    .run({
      slug: exercise.slug,
      title: exercise.title,
      position: exercise.position,
      grounded: toFlag(exercise.grounded),
      referenceSolutionSection: exercise.referenceSolutionSection ?? null,
      problemStatement: exercise.problemStatement ?? null
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

export function getDesignFeedback(db: Database, id: number): DesignFeedback | undefined {
  const row = db
    .prepare(`SELECT ${DESIGN_FEEDBACK_COLUMNS} FROM design_feedback WHERE id = $id`)
    .get<DesignFeedbackRow>({ id })
  return row && toDesignFeedback(row)
}

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
  return getDesignFeedback(db, lastInsertRowid)!
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

// Protocol Step submissions

interface SubmissionRow extends Omit<ProtocolStepSubmission, 'content'> {
  content: string
}

const SUBMISSION_COLUMNS = `id, design_exercise_id AS designExerciseId, protocol_step AS protocolStep,
  number, status, content, design_feedback_id AS designFeedbackId, ${TIMESTAMP_COLUMNS}`

const toSubmission = (row: SubmissionRow): ProtocolStepSubmission => ({
  ...row,
  content: fromJson(row.content)
})

export function getProtocolStepSubmission(
  db: Database,
  id: number
): ProtocolStepSubmission | undefined {
  const row = db
    .prepare(`SELECT ${SUBMISSION_COLUMNS} FROM protocol_step_submissions WHERE id = $id`)
    .get<SubmissionRow>({ id })
  return row && toSubmission(row)
}

/** Records a `pending` submission with the next number of its exercise and step. */
export function createProtocolStepSubmission(
  db: Database,
  submission: { designExerciseId: number; protocolStep: ProtocolStep; content: Json }
): ProtocolStepSubmission {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO protocol_step_submissions (design_exercise_id, protocol_step, number, content)
       VALUES ($designExerciseId, $protocolStep,
         (SELECT COALESCE(MAX(number), 0) + 1 FROM protocol_step_submissions
          WHERE design_exercise_id = $designExerciseId AND protocol_step = $protocolStep),
         $content)`
    )
    .run({
      designExerciseId: submission.designExerciseId,
      protocolStep: submission.protocolStep,
      content: toJson(submission.content)
    })
  return getProtocolStepSubmission(db, lastInsertRowid)!
}

/** `reviewed` (with its step feedback) or `failed`. */
export function settleProtocolStepSubmission(
  db: Database,
  id: number,
  outcome: { status: Exclude<SubmissionStatus, 'pending'>; designFeedbackId?: number | null }
): ProtocolStepSubmission {
  db.prepare(
    `UPDATE protocol_step_submissions
     SET status = $status, design_feedback_id = $designFeedbackId, updated_at = ${NOW}
     WHERE id = $id`
  ).run({ id, status: outcome.status, designFeedbackId: outcome.designFeedbackId ?? null })
  return getProtocolStepSubmission(db, id)!
}

/** Pending submissions left by a run that never ended (app quit or crash) become `failed`. */
export function failPendingProtocolStepSubmissions(db: Database): number {
  return db
    .prepare(
      `UPDATE protocol_step_submissions SET status = 'failed', updated_at = ${NOW}
       WHERE status = 'pending'`
    )
    .run().changes
}

/** Submissions of a design exercise, oldest first. */
export function listProtocolStepSubmissions(
  db: Database,
  designExerciseId: number
): ProtocolStepSubmission[] {
  return db
    .prepare(
      `SELECT ${SUBMISSION_COLUMNS} FROM protocol_step_submissions
       WHERE design_exercise_id = $designExerciseId ORDER BY id`
    )
    .all<SubmissionRow>({ designExerciseId })
    .map(toSubmission)
}

// Protocol Step drafts

const DRAFT_COLUMNS = `design_exercise_id AS designExerciseId, protocol_step AS protocolStep, text,
  ${TIMESTAMP_COLUMNS}`

export function saveProtocolStepDraft(
  db: Database,
  draft: { designExerciseId: number; protocolStep: ProtocolStep; text: string }
): void {
  db.prepare(
    `INSERT INTO protocol_step_drafts (design_exercise_id, protocol_step, text)
     VALUES ($designExerciseId, $protocolStep, $text)
     ON CONFLICT (design_exercise_id, protocol_step)
     DO UPDATE SET text = excluded.text, updated_at = ${NOW}`
  ).run(draft)
}

export function listProtocolStepDrafts(
  db: Database,
  designExerciseId: number
): ProtocolStepDraft[] {
  return db
    .prepare(
      `SELECT ${DRAFT_COLUMNS} FROM protocol_step_drafts
       WHERE design_exercise_id = $designExerciseId`
    )
    .all<ProtocolStepDraft>({ designExerciseId })
}

// Protocol Step encounters (Protocol Step Lessons read)

/** Records that the learner read the step's Protocol Step Lesson; the first record is kept. */
export function recordProtocolStepEncounter(
  db: Database,
  protocolStep: ProtocolStep,
  designExerciseId: number
): void {
  db.prepare(
    `INSERT INTO protocol_step_encounters (protocol_step, design_exercise_id)
     VALUES ($protocolStep, $designExerciseId) ON CONFLICT (protocol_step) DO NOTHING`
  ).run({ protocolStep, designExerciseId })
}

export function listProtocolStepEncounters(db: Database): ProtocolStepEncounter[] {
  return db
    .prepare(
      `SELECT protocol_step AS protocolStep, design_exercise_id AS designExerciseId,
         ${TIMESTAMP_COLUMNS}
       FROM protocol_step_encounters ORDER BY created_at, protocol_step`
    )
    .all<ProtocolStepEncounter>()
}
