/**
 * Interview Protocol: the Protocol Steps of a Design Exercise, their canonical order, the plan
 * that unlocks them across exercises, and what each step must contain (used by the feedback,
 * hint and Protocol Step Lesson prompts). Pure data, shared by the main process and the renderer.
 * Rationale of the unlock plan: docs/Interview Protocol Implementation.md.
 */
import type { DesignExport } from './designGraph'
import type { GenerationErrorInfo } from './generation'

/** Every Protocol Step, in canonical interview order. Display order never changes. */
export const protocolSteps = [
  'functional_requirements',
  'non_functional_requirements',
  'estimations',
  'api',
  'data_model',
  'high_level_design',
  'deep_dive'
] as const
export type ProtocolStep = (typeof protocolSteps)[number]

export const isProtocolStep = (value: unknown): value is ProtocolStep =>
  typeof value === 'string' && (protocolSteps as readonly string[]).includes(value)

/** `text`: free text in a step editor. `canvas`: the Design Canvas, sent as a Design Export. */
export type ProtocolStepInput = 'text' | 'canvas'

export interface ProtocolChecklistItem {
  /** Stable id, kebab-case. */
  id: string
  /** What a good submission does, in English (prompt material; the learner sees French feedback). */
  item: string
}

export interface ProtocolStepDefinition {
  step: ProtocolStep
  /** UI title (English, like every UI string in the source). */
  title: string
  input: ProtocolStepInput
  /** The purpose of the step, one or two sentences (English, prompt material). */
  goal: string
  /** What the feedback checks, one verdict per item, in order. */
  checklist: ProtocolChecklistItem[]
  /** Placeholder of the step editor. */
  placeholder: string
}

export const PROTOCOL_STEP_DEFINITIONS: Record<ProtocolStep, ProtocolStepDefinition> = {
  functional_requirements: {
    step: 'functional_requirements',
    title: 'Functional requirements',
    input: 'text',
    goal: 'Scope the problem: who uses the system, what they can do with it (the use cases), and what is explicitly out of scope, before designing anything.',
    checklist: [
      {
        id: 'actors',
        item: 'Names who uses the system (users, internal services) and how they use it.'
      },
      {
        id: 'core-use-cases',
        item: 'Lists the core use cases as short, testable actions (inputs and outputs of the system).'
      },
      {
        id: 'out-of-scope',
        item: 'States what is out of scope, so the design stays small enough for the time available.'
      },
      {
        id: 'clarifying-questions',
        item: 'Asks or records the clarifying questions and assumptions an interviewer would expect (edge cases such as expiration, anonymous users, analytics).'
      }
    ],
    placeholder:
      'One item per line, for example:\n- User creates a paste and gets a short link\n- Out of scope: user accounts'
  },
  non_functional_requirements: {
    step: 'non_functional_requirements',
    title: 'Non-functional requirements',
    input: 'text',
    goal: 'State the qualities the system must have (availability, latency, consistency, durability, scale) and which one wins when they conflict.',
    checklist: [
      {
        id: 'availability-latency',
        item: 'States the availability and latency expectations, tied to the use cases (for example reads must be fast).'
      },
      {
        id: 'consistency',
        item: 'Chooses a consistency level (strong or eventual) where it matters and says why.'
      },
      {
        id: 'scale-and-traffic-shape',
        item: 'Describes the expected scale and traffic shape (read/write ratio, uneven traffic, growth).'
      },
      {
        id: 'priorities',
        item: 'Says which quality is prioritized when two conflict (a trade-off, not a wish list).'
      }
    ],
    placeholder:
      'One item per line, for example:\n- Reading a paste must be fast\n- Availability over consistency for reads'
  },
  estimations: {
    step: 'estimations',
    title: 'Estimations',
    input: 'text',
    goal: 'Run back-of-the-envelope calculations from the stated assumptions to size traffic and storage, so later choices rest on numbers.',
    checklist: [
      {
        id: 'assumptions',
        item: 'Starts from explicit assumptions (users, writes and reads per month, read/write ratio, size of one item).'
      },
      {
        id: 'traffic',
        item: 'Converts them to requests per second for reads and writes, with the conversion shown.'
      },
      {
        id: 'storage',
        item: 'Estimates storage per item and growth over time (per month and over a few years).'
      },
      {
        id: 'design-impact',
        item: 'Draws a conclusion from the numbers for the design (for example a single database can take the writes, reads need a cache).'
      }
    ],
    placeholder:
      'Show the calculation, for example:\n- 10 million writes per month = about 4 writes per second'
  },
  api: {
    step: 'api',
    title: 'API',
    input: 'text',
    goal: 'Define the interface clients call for each core use case: operations, inputs, outputs and errors.',
    checklist: [
      {
        id: 'one-call-per-use-case',
        item: 'Gives one API call per core use case, with a clear name or HTTP method and path.'
      },
      {
        id: 'inputs-outputs',
        item: 'Specifies the parameters and the response of each call.'
      },
      {
        id: 'errors-and-edge-cases',
        item: 'Covers errors and edge cases (not found, expired, invalid input).'
      },
      {
        id: 'style-choice',
        item: 'Justifies the API style (for example REST for public clients, RPC for internal calls).'
      }
    ],
    placeholder:
      'One call per line, for example:\n- POST /api/v1/paste { contents, expiration } -> { shortlink }'
  },
  data_model: {
    step: 'data_model',
    title: 'Data model',
    input: 'text',
    goal: 'Decide what is stored, where, and how it is looked up: entities, fields, keys and the kind of store.',
    checklist: [
      {
        id: 'entities-fields',
        item: 'Lists the entities with their fields and types, consistent with the API.'
      },
      {
        id: 'keys-indexes',
        item: 'Chooses primary keys and indexes that serve the main lookups.'
      },
      {
        id: 'store-choice',
        item: 'Chooses the kind of store (SQL, NoSQL, object store) and justifies it with the access patterns.'
      },
      {
        id: 'size-consistency',
        item: 'Is consistent with the estimations (item size, growth).'
      }
    ],
    placeholder:
      'One entity per block, for example:\npastes: shortlink (primary key), created_at, expiration, paste_path'
  },
  high_level_design: {
    step: 'high_level_design',
    title: 'High-level design',
    input: 'canvas',
    goal: 'Sketch the main components and how requests flow between them for each core use case, and justify each component.',
    checklist: [
      {
        id: 'covers-use-cases',
        item: 'Every core use case can be followed through the diagram from the client to the storage and back.'
      },
      {
        id: 'main-components',
        item: 'Has the main components (clients, servers, storage) and nothing unexplained.'
      },
      {
        id: 'connections',
        item: 'Connects the components with arrows that match the request flow (no dangling or missing link).'
      },
      {
        id: 'justification',
        item: 'Justifies the main choices (labels or notes on the canvas, or the notes field).'
      }
    ],
    placeholder: 'Optional notes: what each component does, why it is there.'
  },
  deep_dive: {
    step: 'deep_dive',
    title: 'Deep dive',
    input: 'canvas',
    goal: 'Find the bottlenecks of the high-level design given the constraints, and address them with scaling techniques and their trade-offs.',
    checklist: [
      {
        id: 'bottlenecks',
        item: 'Identifies the bottlenecks and single points of failure of the design, with the numbers that justify them.'
      },
      {
        id: 'scaling-techniques',
        item: 'Applies fitting techniques (load balancer, horizontal scaling, cache, replication, sharding, queue) where they solve a bottleneck.'
      },
      {
        id: 'trade-offs',
        item: 'Discusses the trade-offs and alternatives of each technique (cost, complexity, consistency).'
      },
      {
        id: 'iterative',
        item: 'Scales iteratively from the initial design, not by jumping to a final architecture.'
      }
    ],
    placeholder: 'Notes: bottlenecks, what you changed and the trade-offs.'
  }
}

/**
 * Unlock plan: the steps each exercise adds, by exercise index (1-based rank of the Design
 * Exercise in the Learning Path). Exercise 1 is fixed (functional requirements + high-level
 * design); at most two new steps per exercise after that. See the rationale in
 * docs/Interview Protocol Implementation.md.
 */
export const PROTOCOL_UNLOCK_PLAN: readonly { exerciseIndex: number; adds: ProtocolStep[] }[] = [
  { exerciseIndex: 1, adds: ['functional_requirements', 'high_level_design'] },
  { exerciseIndex: 2, adds: ['estimations'] },
  { exerciseIndex: 3, adds: ['api', 'data_model'] },
  { exerciseIndex: 4, adds: ['non_functional_requirements'] },
  { exerciseIndex: 5, adds: ['deep_dive'] }
]

function assertExerciseIndex(exerciseIndex: number): void {
  if (!Number.isSafeInteger(exerciseIndex) || exerciseIndex < 1) {
    throw new Error(`Invalid exercise index: ${exerciseIndex}`)
  }
}

/** The exercise index from which a step is active. */
export function unlockedAt(step: ProtocolStep): number {
  return PROTOCOL_UNLOCK_PLAN.find(({ adds }) => adds.includes(step))!.exerciseIndex
}

/** Active steps of the exercise with this index, in canonical order. */
export function activeStepsFor(exerciseIndex: number): ProtocolStep[] {
  assertExerciseIndex(exerciseIndex)
  return protocolSteps.filter((step) => unlockedAt(step) <= exerciseIndex)
}

/** Steps this exercise activates for the first time, in canonical order. */
export function newStepsFor(exerciseIndex: number): ProtocolStep[] {
  assertExerciseIndex(exerciseIndex)
  return protocolSteps.filter((step) => unlockedAt(step) === exerciseIndex)
}

/** The active steps before `step` in canonical order (the context of its feedback). */
export function previousActiveSteps(exerciseIndex: number, step: ProtocolStep): ProtocolStep[] {
  const active = activeStepsFor(exerciseIndex)
  return active.slice(0, Math.max(0, active.indexOf(step)))
}

// Hints

/** 1: nudge (a question), 2: direction (where to look), 3: near-solution (never the reference). */
export const HINT_LEVELS = [1, 2, 3] as const
export type HintLevel = (typeof HINT_LEVELS)[number]
export const MAX_HINT_LEVEL: HintLevel = 3

/** The level of the next Hint after `given` hints on a step, or null when none is left. */
export function nextHintLevel(given: number): HintLevel | null {
  if (!Number.isSafeInteger(given) || given < 0) throw new Error(`Invalid hint count: ${given}`)
  return given < MAX_HINT_LEVEL ? ((given + 1) as HintLevel) : null
}

// Generated content (validated with zod in src/main/generation/prompts/designFeedback.ts)

export const checklistVerdicts = ['met', 'partial', 'missing'] as const
export type ChecklistVerdict = (typeof checklistVerdicts)[number]

/** Design Feedback on one submitted step. French text. */
export type StepFeedback = {
  /** One entry per checklist item of the step, in order. */
  checklist: { verdict: ChecklistVerdict; comment: string }[]
  summary: string
  gaps: string[]
  errors: string[]
  forgottenTradeOffs: string[]
  nextStep: string
}

export type HintContent = {
  hint: string
}

/** Final review of the whole exercise against the Reference Solution. French text. */
export type FinalReview = {
  summary: string
  strengths: string[]
  gapsVsReference: string[]
  tradeOffsToDiscuss: string[]
  nextTime: string[]
}

// IPC views and requests

/** What the learner submits for a step. */
export type ProtocolSubmissionInput =
  { type: 'text'; text: string } | { type: 'canvas'; designExport: DesignExport; notes: string }

/** Stored content of a submission (the PNG of a canvas step is not stored). */
export type StoredSubmission =
  | { type: 'text'; text: string }
  | {
      type: 'canvas'
      graph: DesignExport['graph']
      description: string
      notes: string
      /** True when the PNG capture was sent with the feedback request. */
      withPng: boolean
    }

export type SubmissionStatus = 'pending' | 'reviewed' | 'failed'

export interface SubmissionView {
  id: number
  /** 1, 2... per exercise and step, failed submissions included. */
  number: number
  status: SubmissionStatus
  content: StoredSubmission
  feedback: StepFeedback | null
  submittedAt: string
}

export interface HintView {
  id: number
  level: HintLevel
  hint: string
  requestedAt: string
}

export interface ProtocolStepView {
  step: ProtocolStep
  /** False: not unlocked at this exercise index (shown, locked). */
  active: boolean
  /** Exercise index that unlocks the step. */
  unlockedAt: number
  /** First exercise where the step is active. */
  isNew: boolean
  /** The learner has already read the step's Protocol Step Lesson (in any exercise). */
  lessonSeen: boolean
  /** Saved editor text (text steps), notes (canvas steps). */
  draft: string
  submissions: SubmissionView[]
  hints: HintView[]
  /** Null when the three hints were given. */
  nextHintLevel: HintLevel | null
}

export interface FinalReviewView {
  id: number
  review: FinalReview
  createdAt: string
}

export interface ProtocolExerciseView {
  id: number
  title: string
  problemStatement: string
  exerciseIndex: number
  /** The primer's solution, shown after the final review (CC BY 4.0, link and attribution). */
  referenceSolution: { title: string; url: string } | null
  steps: ProtocolStepView[]
  /** Every active step has at least one reviewed submission. */
  canRequestFinalReview: boolean
  /** Latest final review, if any. */
  finalReview: FinalReviewView | null
}

/** A Generation-backed call: a failed Generation is an outcome with its typed error. */
export type ProtocolOutcome<T> =
  | { status: 'done'; value: T; exercise: ProtocolExerciseView }
  | { status: 'failed'; error: GenerationErrorInfo; exercise: ProtocolExerciseView }

export interface ProtocolExerciseRequest {
  designExerciseId: number
}

export interface ProtocolDraftRequest {
  designExerciseId: number
  step: ProtocolStep
  text: string
}

export interface ProtocolLessonSeenRequest {
  designExerciseId: number
  step: ProtocolStep
}

export interface ProtocolStepLessonRequest {
  /** Chosen by the renderer (`crypto.randomUUID()`), tags every event. */
  requestId: string
  step: ProtocolStep
}

export interface ProtocolSubmitRequest {
  requestId: string
  designExerciseId: number
  step: ProtocolStep
  submission: ProtocolSubmissionInput
}

export interface ProtocolHintRequest {
  requestId: string
  designExerciseId: number
  step: ProtocolStep
  /** The current state of the step (editor text, or the live canvas), so the hint fits it. */
  current: ProtocolSubmissionInput
}

export interface ProtocolFinalReviewRequest {
  requestId: string
  designExerciseId: number
}

export interface ProtocolCancelRequest {
  requestId: string
}

export interface ProtocolDevExerciseRequest {
  exerciseIndex: number
}
