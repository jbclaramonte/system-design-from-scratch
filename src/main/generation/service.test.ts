import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { GenerationEvent } from '../../shared/generation'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  contentCacheKey,
  getCachedContent,
  putCachedContent
} from '../db/repositories/contentCache'
import type { CliCallOptions } from './cliRunner'
import { GenerationError } from './errors'
import { GenerationService, type CliRunner, type GenerationRequest } from './service'
import type { CliResult } from './streamJson'
import { installFakeCli, isAlive, type FakeCli } from './testing/fakeCli'

const quizSchema = z.object({
  questions: z
    .array(
      z.object({ prompt: z.string(), choices: z.array(z.string()), correct: z.array(z.number()) })
    )
    .min(1)
})

const prompt = (scenario: string, version = 'v1') => ({
  version,
  system: 'system',
  user: `scenario:${scenario}`
})

const lessonRequest = (scenario = 'text'): GenerationRequest => ({
  kind: 'lesson',
  input: { topic: 'cache' },
  prompt: prompt(scenario),
  groundedSourceSections: ['cache/when-to-update-the-cache']
})

async function collect(events: AsyncIterable<GenerationEvent>): Promise<GenerationEvent[]> {
  const all: GenerationEvent[] = []
  for await (const event of events) all.push(event)
  return all
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

describe('GenerationService with the fake CLI', () => {
  let fake: FakeCli
  let service: GenerationService

  beforeEach(() => {
    fake = installFakeCli()
    service = new GenerationService({
      db,
      cli: { env: fake.env, killGraceMs: 200 },
      resolveCli: async () => fake.bin
    })
  })

  afterEach(() => {
    service.dispose()
    fake.cleanup()
  })

  it('streams a lesson, then stores it in the Content Cache with its grounding', async () => {
    const run = service.generate(lessonRequest())

    const events = await collect(run.events)

    expect(events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'text_delta',
      'text_delta',
      'text_delta',
      'done'
    ])
    const result = await run.result
    expect(result).toMatchObject({
      content: 'Bonjour, le cache en bref.',
      fromCache: false,
      grounded: true,
      sourceSections: ['cache/when-to-update-the-cache'],
      usage: { outputTokens: 12, costUsd: 0.0001232 }
    })
    const key = contentCacheKey('lesson', { topic: 'cache' }, 'v1')
    expect(result.cacheKey).toBe(key)
    expect(getCachedContent(db, key)).toMatchObject({
      content: 'Bonjour, le cache en bref.',
      grounded: true,
      sourceSections: ['cache/when-to-update-the-cache']
    })
  })

  it('serves a repeat request from the cache without calling the CLI', async () => {
    await service.generate(lessonRequest()).result

    const run = service.generate(lessonRequest())

    expect(await collect(run.events)).toEqual([
      { type: 'done', output: expect.objectContaining({ fromCache: true, usage: null }) }
    ])
    await expect(run.result).resolves.toMatchObject({ content: 'Bonjour, le cache en bref.' })
    expect(fake.calls()).toHaveLength(1)
  })

  it('misses the cache when the prompt version changes', async () => {
    await service.generate(lessonRequest()).result

    await service.generate({ ...lessonRequest(), prompt: prompt('text', 'v2') }).result

    expect(fake.calls()).toHaveLength(2)
  })

  it('marks ungrounded content', async () => {
    const result = await service.generate({ ...lessonRequest(), groundedSourceSections: [] }).result

    expect(result).toMatchObject({ grounded: false, sourceSections: [] })
  })

  it('validates structured output, passes the JSON schema and sends no text deltas', async () => {
    const run = service.generate({
      kind: 'quiz',
      input: { t: 1 },
      prompt: prompt('json'),
      schema: quizSchema
    })

    const events = await collect(run.events)

    expect(events.map((e) => e.type)).toEqual(['queued', 'started', 'done'])
    await expect(run.result).resolves.toMatchObject({ content: { questions: [{ prompt: 'Q?' }] } })
    const argv = fake.calls()[0]!.argv
    const schema = JSON.parse(argv[argv.indexOf('--json-schema') + 1]!) as object
    // The real CLI rejects zod's default draft 2020-12 `$schema` reference.
    expect(schema).not.toHaveProperty('$schema')
    expect(schema).toMatchObject({ type: 'object', required: ['questions'] })
  })

  it('accepts JSON in a fenced text block when there is no structured output', async () => {
    const result = await service.generate({
      kind: 'quiz',
      input: {},
      prompt: prompt('json-in-text'),
      schema: quizSchema
    }).result

    expect(result.content).toMatchObject({ questions: [{ prompt: 'Q?' }] })
  })

  it('retries once on invalid output, feeding the validation error back', async () => {
    const run = service.generate({
      kind: 'quiz',
      input: {},
      prompt: prompt('json-invalid-once'),
      schema: quizSchema
    })

    const events = await collect(run.events)

    expect(events.map((e) => e.type)).toEqual(['queued', 'started', 'retry', 'started', 'done'])
    const calls = fake.calls()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.stdin).toContain('Your previous output was invalid')
    expect(calls[1]!.stdin).toContain('questions')
  })

  it('fails with invalid_output after the retry and caches nothing', async () => {
    const run = service.generate({
      kind: 'quiz',
      input: {},
      prompt: prompt('json-invalid-always'),
      schema: quizSchema
    })

    const events = await collect(run.events)

    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'invalid_output' } })
    await expect(run.result).rejects.toMatchObject({ code: 'invalid_output' })
    expect(fake.calls()).toHaveLength(2)
    expect(getCachedContent(db, contentCacheKey('quiz', {}, 'v1'))).toBeUndefined()
  })

  it('treats empty text as invalid output', async () => {
    await expect(service.generate(lessonRequest('empty')).result).rejects.toMatchObject({
      code: 'invalid_output'
    })
  })

  it('surfaces is_error results with subtype success as typed errors, uncached', async () => {
    const run = service.generate(lessonRequest('bad-model'))

    await expect(run.result).rejects.toBeInstanceOf(GenerationError)
    await expect(run.result).rejects.toMatchObject({ code: 'bad_model' })
    expect(
      getCachedContent(db, contentCacheKey('lesson', { topic: 'cache' }, 'v1'))
    ).toBeUndefined()
  })

  it('cancels a running generation, kills the CLI and caches nothing', async () => {
    const controller = new AbortController()
    const run = service.generate({ ...lessonRequest('slow'), signal: controller.signal })
    const events: GenerationEvent[] = []
    for await (const event of run.events) {
      events.push(event)
      if (event.type === 'text_delta') controller.abort()
    }

    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'cancelled' } })
    await expect(run.result).rejects.toMatchObject({ code: 'cancelled' })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(isAlive(fake.calls()[0]!.pid)).toBe(false)
    expect(
      getCachedContent(db, contentCacheKey('lesson', { topic: 'cache' }, 'v1'))
    ).toBeUndefined()
  })

  it('times out', async () => {
    const run = service.generate({ ...lessonRequest('slow'), timeoutMs: 300 })

    await expect(run.result).rejects.toMatchObject({ code: 'timeout' })
  })

  it('never caches kinds outside the Content Cache', async () => {
    const request: GenerationRequest = {
      kind: 'free_answer_grading',
      input: { answer: 'x' },
      prompt: prompt('text')
    }

    const first = await service.generate(request).result
    await service.generate(request).result

    expect(first.cacheKey).toBeNull()
    expect(fake.calls()).toHaveLength(2)
  })

  it('regenerates a cached structured entry that no longer matches the schema', async () => {
    putCachedContent(db, {
      kind: 'quiz',
      inputs: {},
      promptVersion: 'v1',
      content: { old: true },
      grounded: false
    })

    const result = await service.generate({
      kind: 'quiz',
      input: {},
      prompt: prompt('json'),
      schema: quizSchema
    }).result

    expect(result.fromCache).toBe(false)
  })
})

describe('GenerationService queue and deduplication', () => {
  interface PendingCall {
    options: CliCallOptions
    finish(text?: string): void
  }

  function controllableRunner() {
    const calls: PendingCall[] = []
    const runner: CliRunner = (options) =>
      new Promise<CliResult>((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
        calls.push({
          options,
          finish(text = `text for ${options.prompt}`) {
            options.onEvent?.({ type: 'text_delta', text })
            resolve({
              isError: false,
              subtype: 'success',
              text,
              structuredOutput: undefined,
              inputTokens: 1,
              outputTokens: 1,
              costUsd: 0
            })
          }
        })
      })
    return { runner, calls }
  }

  const request = (topic: string, extra: Partial<GenerationRequest> = {}): GenerationRequest => ({
    kind: 'lesson',
    input: { topic },
    prompt: { version: 'v1', system: 's', user: topic },
    ...extra
  })

  function setup(concurrency = 2) {
    const { runner, calls } = controllableRunner()
    const service = new GenerationService({
      db,
      runner,
      queue: { concurrency },
      resolveCli: async () => '/fake/claude'
    })
    const prompts = () => calls.map((call) => call.options.prompt)
    return { service, calls, prompts }
  }

  it('shares one CLI call between identical in-flight requests', async () => {
    const { service, calls } = setup()
    const first = service.generate(request('cache'))
    await tick()
    const second = service.generate(request('cache'))

    calls[0]!.finish()

    const [a, b] = await Promise.all([first.result, second.result])
    expect(calls).toHaveLength(1)
    expect(a.content).toBe(b.content)
    const replayed = await collect(second.events)
    expect(replayed.map((e) => e.type)).toEqual(['queued', 'started', 'text_delta', 'done'])
  })

  it('keeps a shared call alive while one subscriber remains', async () => {
    const { service, calls } = setup()
    const controller = new AbortController()
    const leaving = service.generate(request('cache', { signal: controller.signal }))
    const staying = service.generate(request('cache'))
    await tick()

    controller.abort()
    calls[0]!.finish()

    await expect(leaving.result).rejects.toMatchObject({ code: 'cancelled' })
    await expect(staying.result).resolves.toMatchObject({ fromCache: false })
    expect(calls[0]!.options.signal?.aborted).toBe(false)
  })

  it('aborts the CLI call when every subscriber has left', async () => {
    const { service, calls } = setup()
    const a = new AbortController()
    const b = new AbortController()
    const first = service.generate(request('cache', { signal: a.signal }))
    const second = service.generate(request('cache', { signal: b.signal }))
    await tick()

    a.abort()
    b.abort()

    await expect(first.result).rejects.toMatchObject({ code: 'cancelled' })
    await expect(second.result).rejects.toMatchObject({ code: 'cancelled' })
    expect(calls[0]!.options.signal?.aborted).toBe(true)
  })

  it('respects the concurrency limit and runs foreground requests first', async () => {
    const { service, calls, prompts } = setup(2)
    service.pregenerate(request('bg1'))
    service.generate(request('fg1'))
    service.pregenerate(request('bg2'))
    service.generate(request('fg2'))
    await tick()

    expect(prompts()).toEqual(['bg1', 'fg1'])

    calls[1]!.finish()
    await tick()
    expect(prompts()).toEqual(['bg1', 'fg1', 'fg2'])

    calls[0]!.finish()
    await tick()
    expect(prompts()).toEqual(['bg1', 'fg1', 'fg2', 'bg2'])
  })

  it('promotes a queued pre-generation when a foreground request joins it', async () => {
    const { service, calls, prompts } = setup(1)
    service.generate(request('busy'))
    service.pregenerate(request('bg'))
    service.generate(request('fg'))
    const joined = service.generate(request('bg'))
    await tick()

    calls[0]!.finish()
    await tick()

    expect(prompts()).toEqual(['busy', 'bg'])
    calls[1]!.finish()
    await expect(joined.result).resolves.toMatchObject({ content: 'text for bg' })
  })

  it('cancels background pre-generations only', async () => {
    const { service, calls } = setup(2)
    const background = service.pregenerate(request('bg'))
    const queued = service.pregenerate(request('bg-queued'))
    const foreground = service.generate(request('fg'))
    await tick()

    service.cancelPregenerations()

    await expect(background.result).rejects.toMatchObject({ code: 'cancelled' })
    await expect(queued.result).rejects.toMatchObject({ code: 'cancelled' })
    calls.find((call) => call.options.prompt === 'fg')!.finish()
    await expect(foreground.result).resolves.toBeDefined()
  })

  it('cancels a pre-generation through its handle', async () => {
    const { service, calls } = setup()
    const handle = service.pregenerate(request('bg'))
    await tick()

    handle.cancel()

    await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' })
    expect(calls[0]!.options.signal?.aborted).toBe(true)
  })

  it('reports cli_not_found from the resolver and resolves again next time', async () => {
    let attempts = 0
    const service = new GenerationService({
      db,
      runner: controllableRunner().runner,
      resolveCli: async () => {
        attempts++
        throw new GenerationError('cli_not_found')
      }
    })

    const run = service.generate(request('a'))
    const events = await collect(run.events)
    await service.generate(request('b')).result.catch(() => {})

    expect(events.at(-1)).toMatchObject({ type: 'error', error: { code: 'cli_not_found' } })
    expect(attempts).toBe(2)
  })
})
