import { z } from 'zod'
import type {
  GenerationErrorInfo,
  GenerationEvent,
  GenerationKind,
  GenerationOutput,
  GenerationPriority,
  GenerationUsage,
  Json
} from '../../shared/generation'
import type { Database } from '../db'
import {
  contentCacheKey,
  getCachedContent,
  putCachedContent
} from '../db/repositories/contentCache'
import type { ContentCacheKind } from '../db/types'
import { cliEnv, runCli, type CliCallOptions, type CliImage } from './cliRunner'
import { GenerationError, toGenerationError } from './errors'
import { EventStream } from './eventStream'
import { GenerationQueue, type QueueOptions, type QueueTask } from './queue'
import { resolveCliPath } from './resolveCli'
import type { CliResult } from './streamJson'

/** The prompt of one Generation. `version` is part of the Content Cache key. */
export interface GenerationPrompt {
  version: string
  system: string
  user: string
}

export interface GenerationRequest<T extends Json = Json> {
  kind: GenerationKind
  /** What the content is generated from. Part of the Content Cache key. */
  input: Json
  prompt: GenerationPrompt
  /** Structured output: passed to the CLI as `--json-schema` and validated on return. */
  schema?: z.ZodType<T>
  /** Source Corpus section ids the prompt was grounded on. Empty or absent: ungrounded. */
  groundedSourceSections?: string[]
  /**
   * Images sent before the prompt text (the Design Export PNG). Not part of the Content Cache
   * key: only for kinds that are not cached.
   */
  images?: CliImage[]
  /** Default `foreground`. */
  priority?: GenerationPriority
  signal?: AbortSignal
  timeoutMs?: number
  /**
   * Post-processing of a valid output, run before it is stored and sent with `done` (the
   * Mermaid Diagram repair of lessons, see `repairDiagrams`). Not part of the Content Cache key.
   */
  finalize?: ContentFinalizer
}

/** One extra CLI call a `finalize` hook may run: structured, one attempt, never cached. */
export interface FinalizeCall<T extends Json = Json> {
  prompt: GenerationPrompt
  schema: z.ZodType<T>
  timeoutMs?: number
}

export interface FinalizeTools {
  /**
   * Runs a call with the Generation's CLI settings and signal. Null when the call fails or its
   * output is invalid; a cancellation is rethrown.
   */
  complete<T extends Json>(call: FinalizeCall<T>): Promise<T | null>
}

export type ContentFinalizer = (content: Json, tools: FinalizeTools) => Promise<Json>

export type GenerationResult<T extends Json = Json> = Omit<GenerationOutput, 'content'> & {
  content: T
}

export interface GenerationRun<T extends Json = Json> {
  /** Ends after a `done` or `error` event. */
  events: AsyncIterable<GenerationEvent>
  /** Rejects with a GenerationError. */
  result: Promise<GenerationResult<T>>
}

export interface PregenerationHandle {
  cancel(): void
  result: Promise<GenerationResult>
}

export type CliRunner = (options: CliCallOptions) => Promise<CliResult>

export interface CliSettings {
  /** Configured path of the `claude` binary; resolved automatically when absent. */
  path?: string
  model?: string
  effort?: string | null
  timeoutMs?: number
  killGraceMs?: number
  env?: NodeJS.ProcessEnv
}

export interface GenerationServiceOptions {
  db: Database
  cli?: CliSettings
  queue?: QueueOptions
  /** Defaults to `runCli`; tests inject a fake. */
  runner?: CliRunner
  /** Defaults to `resolveCliPath` with `cli.path`. */
  resolveCli?: () => Promise<string>
  /**
   * Claude profile directory passed as `CLAUDE_CONFIG_DIR` to every call; read on each call, so a
   * settings change applies at once. Null or absent: the environment is inherited.
   */
  configDir?: () => string | null | undefined
}

const contentCacheKinds = new Set<GenerationKind>([
  'lesson',
  'remediation_lesson',
  'quiz',
  'protocol_step_lesson'
])
const isContentCacheKind = (kind: GenerationKind): kind is ContentCacheKind =>
  contentCacheKinds.has(kind)

/** Attempts per Generation: one automatic retry on invalid output. */
const MAX_ATTEMPTS = 2

type Validation = { ok: true; value: Json } | { ok: false; error: string }

function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/.exec(trimmed)
  try {
    return JSON.parse(fenced ? fenced[1]! : trimmed)
  } catch {
    return undefined
  }
}

function validateOutput(result: CliResult, schema: z.ZodType<Json> | undefined): Validation {
  if (!schema) {
    return result.text.trim()
      ? { ok: true, value: result.text }
      : { ok: false, error: 'The output was empty.' }
  }
  const candidate = result.structuredOutput ?? parseJsonText(result.text)
  if (candidate === undefined) return { ok: false, error: 'The output was not JSON.' }
  const parsed = schema.safeParse(candidate)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: z.prettifyError(parsed.error) }
}

const retryNote = (error: string) =>
  `Your previous output was invalid:\n${error}\nGenerate it again and make it valid.`

const jsonSchemas = new WeakMap<z.ZodType, object | null>()

/**
 * JSON schema for `--json-schema`, or null if the Zod schema has no JSON schema equivalent. The
 * CLI rejects a draft 2020-12 `$schema` reference, so emit draft-07 without `$schema`.
 */
function toJsonSchema(schema: z.ZodType): object | null {
  if (!jsonSchemas.has(schema)) {
    let converted: object | null
    try {
      const jsonSchema: Record<string, unknown> = z.toJSONSchema(schema, { target: 'draft-7' })
      delete jsonSchema['$schema']
      converted = jsonSchema
    } catch {
      converted = null
    }
    jsonSchemas.set(schema, converted)
  }
  return jsonSchemas.get(schema)!
}

interface Subscriber {
  push(event: GenerationEvent): void
}

/** One CLI-backed Generation, shared by every request with the same Content Cache key. */
class Job {
  readonly controller = new AbortController()
  readonly history: GenerationEvent[] = []
  readonly subscribers = new Set<Subscriber>()
  finished = false

  constructor(readonly task: QueueTask) {}

  emit(event: GenerationEvent): void {
    if (this.finished) return
    this.history.push(event)
    if (event.type === 'done' || event.type === 'error') this.finished = true
    for (const subscriber of this.subscribers) subscriber.push(event)
    if (this.finished) this.subscribers.clear()
  }
}

export class GenerationService {
  private readonly db: Database
  private readonly cli: CliSettings
  private readonly queue: GenerationQueue
  private readonly runner: CliRunner
  private readonly resolveCli: () => Promise<string>
  private readonly configDir: () => string | null | undefined
  private readonly jobs = new Set<Job>()
  private readonly inFlight = new Map<string, Job>()
  private cliPath: Promise<string> | undefined

  constructor(options: GenerationServiceOptions) {
    this.db = options.db
    this.cli = options.cli ?? {}
    this.queue = new GenerationQueue(options.queue)
    this.runner = options.runner ?? runCli
    this.resolveCli =
      options.resolveCli ??
      (() => resolveCliPath({ configuredPath: this.cli.path, env: this.cli.env }))
    this.configDir = options.configDir ?? (() => undefined)
  }

  /**
   * Starts (or joins) a Generation. Served from the Content Cache when possible; identical
   * in-flight requests share one CLI call. Failed and cancelled runs are never cached.
   */
  generate<T extends Json = Json>(request: GenerationRequest<T>): GenerationRun<T> {
    const stream = new EventStream<GenerationEvent>()
    let resolveResult!: (result: GenerationResult<T>) => void
    let rejectResult!: (error: GenerationError) => void
    const result = new Promise<GenerationResult<T>>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    // Callers that only read `events` must not trigger an unhandled rejection.
    result.catch(() => {})

    let ended = false
    const subscriber: Subscriber = {
      push(event) {
        if (ended) return
        stream.push(event)
        if (event.type === 'done') resolveResult(event.output as GenerationResult<T>)
        else if (event.type === 'error') rejectResult(fromInfo(event.error))
        else return
        ended = true
        stream.end()
      }
    }

    const key = isContentCacheKind(request.kind)
      ? contentCacheKey(request.kind, request.input, request.prompt.version)
      : null

    const cached = key ? this.fromCache(key, request.schema) : undefined
    if (cached) {
      subscriber.push({ type: 'done', output: cached })
      return { events: stream, result }
    }

    if (request.signal?.aborted) {
      subscriber.push({ type: 'error', error: new GenerationError('cancelled').toInfo() })
      return { events: stream, result }
    }

    const priority = request.priority ?? 'foreground'
    const job = (key && this.inFlight.get(key)) || this.startJob(request, key, priority)
    for (const event of job.history) subscriber.push(event)
    job.subscribers.add(subscriber)
    if (priority === 'foreground' && job.task.priority === 'background') {
      this.queue.promote(job.task)
    }

    request.signal?.addEventListener(
      'abort',
      () => {
        if (!job.subscribers.delete(subscriber)) return
        subscriber.push({ type: 'error', error: new GenerationError('cancelled').toInfo() })
        if (job.subscribers.size === 0) this.abortJob(job)
      },
      { once: true }
    )

    return { events: stream, result }
  }

  /** Background pre-generation: queued behind foreground requests, result goes to the cache. */
  pregenerate(request: Omit<GenerationRequest, 'priority'>): PregenerationHandle {
    const controller = new AbortController()
    const signal = request.signal
      ? AbortSignal.any([request.signal, controller.signal])
      : controller.signal
    const run = this.generate({ ...request, priority: 'background', signal })
    return { cancel: () => controller.abort(), result: run.result }
  }

  /** Cancels every Generation that only background requests are waiting for. */
  cancelPregenerations(): void {
    for (const job of this.jobs) {
      if (job.task.priority === 'background') this.abortJob(job)
    }
  }

  /** Cancels everything (app quit): kills running CLI processes, drops queued jobs. */
  dispose(): void {
    for (const job of this.jobs) this.abortJob(job)
  }

  /** Forgets the resolved CLI path, so the next Generation resolves it again (path setting changed). */
  resetCliPath(): void {
    this.cliPath = undefined
  }

  private fromCache(key: string, schema: z.ZodType | undefined): GenerationOutput | undefined {
    const entry = getCachedContent(this.db, key)
    // An entry that no longer matches the schema is regenerated (schema changed, same version).
    if (!entry || (schema && !schema.safeParse(entry.content).success)) return undefined
    return {
      content: entry.content,
      fromCache: true,
      grounded: entry.grounded,
      sourceSections: entry.sourceSections,
      cacheKey: key,
      usage: null
    }
  }

  private abortJob(job: Job): void {
    job.controller.abort()
    // New identical requests start a fresh job instead of joining one that is being killed.
    this.forgetInFlight(job)
    // A job that has not started yet never runs: end it here.
    if (this.queue.remove(job.task)) {
      job.emit({ type: 'error', error: new GenerationError('cancelled').toInfo() })
      this.forget(job)
    }
  }

  private forget(job: Job): void {
    this.jobs.delete(job)
    this.forgetInFlight(job)
  }

  private forgetInFlight(job: Job): void {
    for (const [key, value] of this.inFlight) {
      if (value === job) this.inFlight.delete(key)
    }
  }

  private startJob(
    request: GenerationRequest<Json>,
    key: string | null,
    priority: GenerationPriority
  ): Job {
    const task: QueueTask = { priority, run: () => this.runJob(job, request, key) }
    const job = new Job(task)
    this.jobs.add(job)
    if (key) this.inFlight.set(key, job)
    job.emit({ type: 'queued' })
    this.queue.add(task)
    return job
  }

  private async runJob(job: Job, request: GenerationRequest<Json>, key: string | null) {
    try {
      const output = await this.execute(job, request, key)
      job.emit({ type: 'done', output })
    } catch (error) {
      const failure = toGenerationError(error)
      // The binary may have moved or been uninstalled: resolve it again next time.
      if (failure.code === 'cli_not_found') this.cliPath = undefined
      job.emit({ type: 'error', error: failure.toInfo() })
    } finally {
      this.forget(job)
    }
  }

  private async execute(
    job: Job,
    request: GenerationRequest<Json>,
    key: string | null
  ): Promise<GenerationOutput> {
    const signal = job.controller.signal
    const bin = await this.cliBinary()
    if (signal.aborted) throw new GenerationError('cancelled')

    const jsonSchema = request.schema ? toJsonSchema(request.schema) : null
    const env = cliEnv(this.configDir(), this.cli.env)
    let feedback: string | undefined
    for (let attempt = 1; ; attempt++) {
      job.emit({ type: 'started', attempt })
      const result = await this.runner({
        bin,
        prompt: feedback ? `${request.prompt.user}\n\n${retryNote(feedback)}` : request.prompt.user,
        systemPrompt: request.prompt.system,
        images: request.images,
        model: this.cli.model,
        effort: this.cli.effort,
        jsonSchema: jsonSchema ?? undefined,
        signal,
        timeoutMs: request.timeoutMs ?? this.cli.timeoutMs,
        killGraceMs: this.cli.killGraceMs,
        env,
        onEvent: (event) => {
          // Structured output arrives as partial JSON fragments: only the final object is sent.
          if (event.type === 'text_delta' && !request.schema && !signal.aborted) {
            job.emit({ type: 'text_delta', text: event.text })
          }
        }
      })
      const validation = validateOutput(result, request.schema)
      if (validation.ok) {
        const content = request.finalize
          ? await request.finalize(validation.value, this.finalizeTools(bin, env, signal))
          : validation.value
        return this.store(request, key, content, result)
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new GenerationError(
          'invalid_output',
          `The generated content was invalid twice in a row. Retry. (${validation.error})`
        )
      }
      feedback = validation.error
      job.emit({ type: 'retry', reason: validation.error })
    }
  }

  private finalizeTools(bin: string, env: NodeJS.ProcessEnv, signal: AbortSignal): FinalizeTools {
    return {
      complete: async <T extends Json>(call: FinalizeCall<T>): Promise<T | null> => {
        try {
          const result = await this.runner({
            bin,
            prompt: call.prompt.user,
            systemPrompt: call.prompt.system,
            model: this.cli.model,
            effort: this.cli.effort,
            jsonSchema: toJsonSchema(call.schema) ?? undefined,
            signal,
            timeoutMs: call.timeoutMs ?? this.cli.timeoutMs,
            killGraceMs: this.cli.killGraceMs,
            env
          })
          const validation = validateOutput(result, call.schema)
          return validation.ok ? (validation.value as T) : null
        } catch (error) {
          if (signal.aborted || toGenerationError(error).code === 'cancelled') {
            throw new GenerationError('cancelled')
          }
          return null
        }
      }
    }
  }

  private store(
    request: GenerationRequest<Json>,
    key: string | null,
    content: Json,
    result: CliResult
  ): GenerationOutput {
    const sourceSections = request.groundedSourceSections ?? []
    const grounded = sourceSections.length > 0
    if (key && isContentCacheKind(request.kind)) {
      try {
        putCachedContent(this.db, {
          kind: request.kind,
          inputs: request.input,
          promptVersion: request.prompt.version,
          content,
          grounded,
          sourceSections
        })
      } catch (error) {
        // The learner still gets the content; it is just regenerated next time.
        console.error('Could not store generated content in the Content Cache', error)
      }
    }
    const usage: GenerationUsage = {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd
    }
    return { content, fromCache: false, grounded, sourceSections, cacheKey: key, usage }
  }

  /** Resolved once; resolved again after a failure (the user may install the CLI meanwhile). */
  private cliBinary(): Promise<string> {
    if (!this.cliPath) {
      const pending = this.resolveCli()
      this.cliPath = pending
      pending.catch(() => {
        if (this.cliPath === pending) this.cliPath = undefined
      })
    }
    return this.cliPath
  }
}

function fromInfo(info: GenerationErrorInfo): GenerationError {
  return new GenerationError(info.code, info.message)
}
