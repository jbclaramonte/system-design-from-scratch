// Interview Protocol service: runs a Design Exercise through its active Protocol Steps. Reads the
// exercise state from the database, records submissions, drafts, Protocol Step Lessons read,
// Hints, step feedback and final reviews, and prepares their Generations (Design Feedback is
// never cached; Protocol Step Lessons are, through the Content Cache).
import type { Corpus, ReferenceSolution } from '../corpus'
import type { Database } from '../db'
import {
  addDesignFeedback,
  createProtocolStepSubmission,
  failPendingProtocolStepSubmissions,
  getDesignExercise,
  listDesignExercises,
  listDesignFeedback,
  listProtocolStepDrafts,
  listProtocolStepEncounters,
  listProtocolStepSubmissions,
  recordProtocolStepEncounter,
  saveProtocolStepDraft,
  settleProtocolStepSubmission
} from '../db/repositories/designPractice'
import type { DesignExercise, DesignFeedback, ProtocolStepSubmission } from '../db/types'
import { GenerationError } from '../generation/errors'
import {
  buildFinalReviewGeneration,
  buildHintGeneration,
  buildProtocolStepLessonGeneration,
  buildStepFeedbackGeneration,
  DESIGN_FEEDBACK_TIMEOUT_MS,
  DESIGN_HINT_TIMEOUT_MS,
  protocolStepLessonExcerpts,
  type ExerciseBrief,
  type StepSubmissionBrief,
  type SubmissionBrief
} from '../generation/prompts'
import type { GenerationRequest, GenerationService } from '../generation/service'
import type { Json } from '../../shared/generation'
import {
  activeStepsFor,
  nextHintLevel,
  previousActiveSteps,
  PROTOCOL_STEP_DEFINITIONS,
  protocolSteps,
  unlockedAt,
  type FinalReview,
  type FinalReviewView,
  type HintContent,
  type HintLevel,
  type HintView,
  type ProtocolExerciseView,
  type ProtocolOutcome,
  type ProtocolStep,
  type ProtocolSubmissionInput,
  type StepFeedback,
  type StoredSubmission,
  type SubmissionView
} from '../../shared/protocol'
import { referenceTermsFor } from './designExercises'
import { exerciseIndexOf } from './exercises'
import { findLeakedTerms, leakRetryNote, redactLeakedEntries, stepFeedbackTexts } from './leakGuard'
import { referenceForSteps } from './reference'

export interface ProtocolServiceDeps {
  db: Database
  corpus: Corpus
  service: Pick<GenerationService, 'generate'>
}

/** Text of a text step, notes of a canvas step. */
export const MAX_STEP_TEXT_LENGTH = 20_000
export const MAX_CANVAS_NOTES_LENGTH = 5_000

export interface StepLessonRun {
  request: GenerationRequest<string>
  /** Source Corpus sections of the excerpts in the prompt. */
  sourceSections: string[]
}

export interface ProtocolService {
  getExercise(designExerciseId: number): ProtocolExerciseView
  saveDraft(designExerciseId: number, step: ProtocolStep, text: string): void
  /** Records that the learner read the step's Protocol Step Lesson (once, ever). */
  markLessonSeen(designExerciseId: number, step: ProtocolStep): ProtocolExerciseView
  /** The Protocol Step Lesson Generation of a step (served from the Content Cache once made). */
  prepareStepLesson(step: ProtocolStep): StepLessonRun
  /** Records the submission, then gets its step feedback. */
  submitStep(
    designExerciseId: number,
    step: ProtocolStep,
    input: ProtocolSubmissionInput,
    signal?: AbortSignal
  ): Promise<ProtocolOutcome<SubmissionView>>
  /** The next Hint (level 1, 2 then 3) on the step, from what the learner has so far. */
  requestHint(
    designExerciseId: number,
    step: ProtocolStep,
    current: ProtocolSubmissionInput,
    signal?: AbortSignal
  ): Promise<ProtocolOutcome<HintView>>
  /** Final review against the Reference Solution, once every active step was reviewed. */
  requestFinalReview(
    designExerciseId: number,
    signal?: AbortSignal
  ): Promise<ProtocolOutcome<FinalReviewView>>
}

// Contents of `design_feedback` rows written here.
interface StepFeedbackRecord {
  submissionId: number
  promptVersion: string
  feedback: StepFeedback
  /**
   * Leak guard: reference terms of the first output, whether it was retried, and the terms still
   * named after the retry (list entries naming them were dropped).
   */
  leakCheck?: { firstLeaked: string[]; retried: boolean; remaining: string[] }
}
interface HintRecord {
  level: HintLevel
  promptVersion: string
  hint: string
}
interface FinalReviewRecord {
  submissionIds: number[]
  promptVersion: string
  review: FinalReview
}

interface ExerciseContext {
  exercise: DesignExercise
  index: number
  problemStatement: string
  solution: ReferenceSolution | undefined
  referenceSolution: { title: string; url: string } | null
}

/**
 * The exercise as a prompt sees it when judging `steps`: the Reference Solution is cut to the
 * parts that answer them, so a step that is not part of the exercise is never expected.
 */
const briefFor = (ctx: ExerciseContext, steps: readonly ProtocolStep[]): ExerciseBrief => ({
  title: ctx.exercise.title,
  problemStatement: ctx.problemStatement,
  referenceSolution: ctx.solution ? referenceForSteps(ctx.solution, steps) : null,
  activeSteps: activeStepsFor(ctx.index)
})

const toBrief = (stored: StoredSubmission): SubmissionBrief =>
  stored.type === 'text'
    ? { type: 'text', text: stored.text }
    : { type: 'canvas', graph: stored.graph, description: stored.description, notes: stored.notes }

/** Rejects a submission that does not fit the step (input kind, size, exercise). */
function checkInput(
  designExerciseId: number,
  step: ProtocolStep,
  input: ProtocolSubmissionInput
): void {
  const expected = PROTOCOL_STEP_DEFINITIONS[step].input
  if (input.type !== expected) {
    throw new Error(`The step ${step} takes a ${expected} submission, not ${input.type}.`)
  }
  if (input.type === 'text' && input.text.length > MAX_STEP_TEXT_LENGTH) {
    throw new Error(`A step text is limited to ${MAX_STEP_TEXT_LENGTH} characters.`)
  }
  if (input.type === 'canvas') {
    if (input.designExport.designExerciseId !== designExerciseId) {
      throw new Error('The Design Export belongs to another design exercise.')
    }
    if (input.notes.length > MAX_CANVAS_NOTES_LENGTH) {
      throw new Error(`Notes are limited to ${MAX_CANVAS_NOTES_LENGTH} characters.`)
    }
  }
}

const inputBrief = (input: ProtocolSubmissionInput): SubmissionBrief =>
  input.type === 'text'
    ? { type: 'text', text: input.text }
    : {
        type: 'canvas',
        graph: input.designExport.graph,
        description: input.designExport.description,
        notes: input.notes
      }

export function createProtocolService(deps: ProtocolServiceDeps): ProtocolService {
  const { db, corpus, service } = deps
  // Submissions still pending come from a run that never ended (the app quit).
  failPendingProtocolStepSubmissions(db)

  function context(designExerciseId: number): ExerciseContext {
    const exercise = getDesignExercise(db, designExerciseId)
    if (!exercise) throw new Error(`Design exercise ${designExerciseId} does not exist.`)
    const index = exerciseIndexOf(listDesignExercises(db), exercise)
    const solution = exercise.referenceSolutionSection
      ? corpus.getReferenceSolution(exercise.referenceSolutionSection)
      : undefined
    if (exercise.referenceSolutionSection && !solution) {
      throw new Error(
        `Reference Solution ${exercise.referenceSolutionSection} is not in the corpus.`
      )
    }
    return {
      exercise,
      index,
      problemStatement: exercise.problemStatement ?? solution?.title ?? exercise.title,
      solution,
      referenceSolution: solution ? { title: solution.title, url: solution.source.url } : null
    }
  }

  function requireActive(ctx: ExerciseContext, step: ProtocolStep): void {
    if (!activeStepsFor(ctx.index).includes(step)) {
      throw new Error(
        `The step ${step} is not active in exercise ${ctx.index} (it unlocks at exercise ${unlockedAt(step)}).`
      )
    }
  }

  const feedbackById = (designExerciseId: number) =>
    new Map(listDesignFeedback(db, designExerciseId).map((row) => [row.id, row]))

  function submissionView(
    submission: ProtocolStepSubmission,
    feedback: Map<number, DesignFeedback>
  ): SubmissionView {
    const row = submission.designFeedbackId ? feedback.get(submission.designFeedbackId) : undefined
    return {
      id: submission.id,
      number: submission.number,
      status: submission.status,
      content: submission.content as StoredSubmission,
      feedback: row ? (row.content as unknown as StepFeedbackRecord).feedback : null,
      submittedAt: submission.createdAt
    }
  }

  const hintView = (row: DesignFeedback): HintView => {
    const record = row.content as unknown as HintRecord
    return { id: row.id, level: record.level, hint: record.hint, requestedAt: row.createdAt }
  }

  const finalReviewView = (row: DesignFeedback): FinalReviewView => ({
    id: row.id,
    review: (row.content as unknown as FinalReviewRecord).review,
    createdAt: row.createdAt
  })

  function view(designExerciseId: number): ProtocolExerciseView {
    const ctx = context(designExerciseId)
    const active = activeStepsFor(ctx.index)
    const submissions = listProtocolStepSubmissions(db, designExerciseId)
    const feedbackRows = listDesignFeedback(db, designExerciseId)
    const feedback = new Map(feedbackRows.map((row) => [row.id, row]))
    const drafts = new Map(
      listProtocolStepDrafts(db, designExerciseId).map((d) => [d.protocolStep, d.text])
    )
    const seen = new Set(listProtocolStepEncounters(db).map((e) => e.protocolStep))
    const steps = protocolSteps.map((step) => {
      const hints = feedbackRows
        .filter((row) => row.kind === 'hint' && row.protocolStep === step)
        .map(hintView)
      return {
        step,
        active: active.includes(step),
        unlockedAt: unlockedAt(step),
        isNew: unlockedAt(step) === ctx.index,
        lessonSeen: seen.has(step),
        draft: drafts.get(step) ?? '',
        submissions: submissions
          .filter((s) => s.protocolStep === step)
          .map((s) => submissionView(s, feedback)),
        hints,
        nextHintLevel: nextHintLevel(hints.length)
      }
    })
    const finalReviews = feedbackRows.filter((row) => row.kind === 'final_review')
    return {
      id: ctx.exercise.id,
      title: ctx.exercise.title,
      problemStatement: ctx.problemStatement,
      exerciseIndex: ctx.index,
      referenceSolution: ctx.referenceSolution,
      steps,
      canRequestFinalReview: steps
        .filter((s) => s.active)
        .every((s) => s.submissions.some((sub) => sub.status === 'reviewed')),
      finalReview: finalReviews.length > 0 ? finalReviewView(finalReviews.at(-1)!) : null
    }
  }

  /** Latest reviewed submission of each of `steps`, skipping steps without one. */
  function latestReviewed(designExerciseId: number, steps: ProtocolStep[]) {
    const submissions = listProtocolStepSubmissions(db, designExerciseId)
    return steps.flatMap((step) => {
      const latest = submissions
        .filter((s) => s.protocolStep === step && s.status === 'reviewed')
        .at(-1)
      return latest ? [{ step, submission: latest }] : []
    })
  }

  const briefs = (items: { step: ProtocolStep; submission: ProtocolStepSubmission }[]) =>
    items.map(({ step, submission }): StepSubmissionBrief => ({
      step,
      submission: toBrief(submission.content as StoredSubmission)
    }))

  /** Runs a Generation-backed call; a GenerationError becomes a `failed` outcome. */
  async function outcome<T>(
    designExerciseId: number,
    run: () => Promise<T>,
    onFailure?: () => void
  ): Promise<ProtocolOutcome<T>> {
    try {
      const value = await run()
      return { status: 'done', value, exercise: view(designExerciseId) }
    } catch (error) {
      onFailure?.()
      if (error instanceof GenerationError) {
        return { status: 'failed', error: error.toInfo(), exercise: view(designExerciseId) }
      }
      throw error
    }
  }

  return {
    getExercise: view,

    saveDraft(designExerciseId, step, text) {
      const ctx = context(designExerciseId)
      requireActive(ctx, step)
      const max =
        PROTOCOL_STEP_DEFINITIONS[step].input === 'text'
          ? MAX_STEP_TEXT_LENGTH
          : MAX_CANVAS_NOTES_LENGTH
      if (text.length > max) throw new Error(`A draft is limited to ${max} characters.`)
      saveProtocolStepDraft(db, { designExerciseId, protocolStep: step, text })
    },

    markLessonSeen(designExerciseId, step) {
      requireActive(context(designExerciseId), step)
      recordProtocolStepEncounter(db, step, designExerciseId)
      return view(designExerciseId)
    },

    prepareStepLesson(step) {
      const excerpts = protocolStepLessonExcerpts(
        step,
        (id) => corpus.findExcerpts({ sectionIds: [id], limit: 1 })[0]
      )
      const build = buildProtocolStepLessonGeneration(step, {
        excerpts,
        corpusVersion: corpus.data.metadata.commitSha
      })
      return { request: build, sourceSections: build.groundedSourceSections }
    },

    async submitStep(designExerciseId, step, input, signal) {
      const ctx = context(designExerciseId)
      requireActive(ctx, step)
      checkInput(designExerciseId, step, input)
      if (input.type === 'text' && !input.text.trim()) {
        throw new Error('Write something before submitting the step.')
      }
      if (input.type === 'canvas' && input.designExport.graph.nodes.length === 0) {
        throw new Error('Draw at least one component before submitting the step.')
      }
      const png = input.type === 'canvas' ? (input.designExport.png?.base64 ?? null) : null
      const stored: StoredSubmission =
        input.type === 'text'
          ? { type: 'text', text: input.text }
          : {
              type: 'canvas',
              graph: input.designExport.graph,
              description: input.designExport.description,
              notes: input.notes,
              withPng: png !== null
            }
      const earlierSteps = previousActiveSteps(ctx.index, step)
      const previous = latestReviewed(designExerciseId, earlierSteps)
      const reviewedBefore = listProtocolStepSubmissions(db, designExerciseId).filter(
        (s) => s.protocolStep === step && s.status === 'reviewed'
      ).length
      const submission = createProtocolStepSubmission(db, {
        designExerciseId,
        protocolStep: step,
        content: stored as unknown as Json
      })
      const build = buildStepFeedbackGeneration({
        exercise: briefFor(ctx, [...earlierSteps, step]),
        step,
        submission: inputBrief(input),
        previousSteps: briefs(previous),
        attempt: reviewedBefore + 1,
        png
      })
      return outcome(
        designExerciseId,
        async () => {
          const run = (user: string) =>
            service.generate({
              ...build,
              prompt: { ...build.prompt, user },
              priority: 'foreground',
              signal,
              timeoutMs: DESIGN_FEEDBACK_TIMEOUT_MS
            }).result
          // Reference items the feedback names but the learner did not write: one retry with
          // the violation, then the list entries that still name one are dropped.
          const terms = referenceTermsFor(ctx.exercise.referenceSolutionSection, step)
          const allowed = [
            ctx.exercise.title,
            ctx.problemStatement,
            ...briefs(previous).map((brief) => JSON.stringify(brief.submission)),
            JSON.stringify(inputBrief(input))
          ].join('\n')
          let { content } = await run(build.prompt.user)
          const firstLeaked = findLeakedTerms(stepFeedbackTexts(content), allowed, terms)
          let leaked = firstLeaked
          if (leaked.length > 0) {
            content = (await run(`${build.prompt.user}\n\n${leakRetryNote(leaked)}`)).content
            leaked = findLeakedTerms(stepFeedbackTexts(content), allowed, terms)
            if (leaked.length > 0) content = redactLeakedEntries(content, leaked, terms)
          }
          const record: StepFeedbackRecord = {
            submissionId: submission.id,
            promptVersion: build.prompt.version,
            feedback: content,
            ...(terms.length > 0 && {
              leakCheck: { firstLeaked, retried: firstLeaked.length > 0, remaining: leaked }
            })
          }
          const settled = db.transaction(() => {
            const row = addDesignFeedback(db, {
              designExerciseId,
              kind: 'step_feedback',
              protocolStep: step,
              content: record as unknown as Json,
              grounded: ctx.solution !== undefined
            })
            return settleProtocolStepSubmission(db, submission.id, {
              status: 'reviewed',
              designFeedbackId: row.id
            })
          })
          return submissionView(settled, feedbackById(designExerciseId))
        },
        () => settleProtocolStepSubmission(db, submission.id, { status: 'failed' })
      )
    },

    async requestHint(designExerciseId, step, current, signal) {
      const ctx = context(designExerciseId)
      requireActive(ctx, step)
      checkInput(designExerciseId, step, current)
      const given = listDesignFeedback(db, designExerciseId)
        .filter((row) => row.kind === 'hint' && row.protocolStep === step)
        .map(hintView)
      const level = nextHintLevel(given.length)
      if (level === null) throw new Error('The three Hints of this step were already given.')
      const earlierSteps = previousActiveSteps(ctx.index, step)
      const build = buildHintGeneration({
        exercise: briefFor(ctx, [...earlierSteps, step]),
        step,
        level,
        current: inputBrief(current),
        previousSteps: briefs(latestReviewed(designExerciseId, earlierSteps)),
        previousHints: given.map((hint) => hint.hint)
      })
      return outcome(designExerciseId, async () => {
        const { content } = await service.generate<HintContent>({
          ...build,
          priority: 'foreground',
          signal,
          timeoutMs: DESIGN_HINT_TIMEOUT_MS
        }).result
        const record: HintRecord = {
          level,
          promptVersion: build.prompt.version,
          hint: content.hint
        }
        return hintView(
          addDesignFeedback(db, {
            designExerciseId,
            kind: 'hint',
            protocolStep: step,
            content: record as unknown as Json,
            grounded: ctx.solution !== undefined
          })
        )
      })
    },

    async requestFinalReview(designExerciseId, signal) {
      const ctx = context(designExerciseId)
      const active = activeStepsFor(ctx.index)
      const latest = latestReviewed(designExerciseId, active)
      if (latest.length < active.length) {
        throw new Error('Submit every active step and get its feedback before the final review.')
      }
      const build = buildFinalReviewGeneration({
        exercise: briefFor(ctx, active),
        steps: briefs(latest)
      })
      return outcome(designExerciseId, async () => {
        const { content } = await service.generate<FinalReview>({
          ...build,
          priority: 'foreground',
          signal,
          timeoutMs: DESIGN_FEEDBACK_TIMEOUT_MS
        }).result
        const record: FinalReviewRecord = {
          submissionIds: latest.map(({ submission }) => submission.id),
          promptVersion: build.prompt.version,
          review: content
        }
        return finalReviewView(
          addDesignFeedback(db, {
            designExerciseId,
            kind: 'final_review',
            protocolStep: null,
            content: record as unknown as Json,
            grounded: ctx.solution !== undefined
          })
        )
      })
    }
  }
}
