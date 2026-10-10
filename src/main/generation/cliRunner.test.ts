import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCliArgs, cliEnv, ISOLATION_FLAGS, runCli, type CliCallOptions } from './cliRunner'
import { classifyCliFailure, cliFailure, GenerationError } from './errors'
import { parseStreamLine, type CliEvent } from './streamJson'
import { installFakeCli, isAlive, type FakeCli } from './testing/fakeCli'

let fake: FakeCli

beforeEach(() => {
  fake = installFakeCli()
})

afterEach(() => fake.cleanup())

function call(scenario: string, options: Partial<CliCallOptions> = {}) {
  const events: CliEvent[] = []
  const promise = runCli({
    bin: fake.bin,
    env: fake.env,
    prompt: `scenario:${scenario}`,
    systemPrompt: 'system',
    onEvent: (event) => events.push(event),
    ...options
  })
  return { events, promise }
}

async function failure(promise: Promise<unknown>): Promise<GenerationError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(GenerationError)
  return error as GenerationError
}

describe('buildCliArgs', () => {
  it('uses stream-json, the isolation flags, sonnet and low effort by default', () => {
    const args = buildCliArgs({ bin: 'claude', prompt: 'p', systemPrompt: 's' })

    expect(args.slice(0, 5)).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose'
    ])
    expect(args.join('\u0000')).toContain(ISOLATION_FLAGS.join('\u0000'))
    expect(args).toEqual(expect.arrayContaining(['--model', 'sonnet', '--effort', 'low']))
    expect(args).not.toContain('--json-schema')
    expect(args).not.toContain('p')
  })

  it('passes the model, omits effort when null and adds the JSON schema', () => {
    const args = buildCliArgs({
      bin: 'claude',
      prompt: 'p',
      systemPrompt: 's',
      model: 'claude-sonnet-5-5',
      effort: null,
      jsonSchema: { type: 'object' }
    })

    expect(args).toEqual(expect.arrayContaining(['--model', 'claude-sonnet-5-5']))
    expect(args).not.toContain('--effort')
    expect(args.slice(-2)).toEqual(['--json-schema', '{"type":"object"}'])
  })
})

describe('parseStreamLine', () => {
  it('ignores blank, non-JSON and unknown lines', () => {
    expect(parseStreamLine('')).toBeUndefined()
    expect(parseStreamLine('not json')).toBeUndefined()
    expect(parseStreamLine('{"type":"rate_limit_event"}')).toBeUndefined()
    expect(parseStreamLine('[1]')).toBeUndefined()
  })

  it('trusts is_error over subtype', () => {
    const event = parseStreamLine(
      '{"type":"result","subtype":"success","is_error":true,"result":"x"}'
    )

    expect(event).toMatchObject({ type: 'result', result: { isError: true, subtype: 'success' } })
  })
})

describe('runCli', () => {
  it('streams text deltas in order and resolves with the result', async () => {
    const { events, promise } = call('text')

    const result = await promise

    expect(events.filter((e) => e.type === 'text_delta')).toEqual([
      { type: 'text_delta', text: 'Bonjour' },
      { type: 'text_delta', text: ', le cache' },
      { type: 'text_delta', text: ' en bref.' }
    ])
    expect(events[0]).toEqual({ type: 'init' })
    expect(events.at(-1)?.type).toBe('result')
    expect(result).toMatchObject({
      isError: false,
      text: 'Bonjour, le cache en bref.',
      outputTokens: 12,
      costUsd: 0.0001232
    })
  })

  it('sends the prompt on stdin from an empty temp cwd that is removed afterwards', async () => {
    await call('text', { prompt: 'scenario:text with a long prompt' }).promise

    const [logged] = fake.calls()
    expect(logged?.stdin).toBe('scenario:text with a long prompt')
    expect(logged?.argv).not.toContain('scenario:text with a long prompt')
    expect(logged?.argv).toEqual(expect.arrayContaining(['--system-prompt', 'system']))
    expect(logged?.cwdEntries).toEqual([])
    // Removed when the process exits, which is shortly after the result.
    await expect.poll(() => existsSync(logged!.cwd), { timeout: 3000 }).toBe(false)
  })

  it('returns the structured output and reports JSON fragments separately', async () => {
    const { events, promise } = call('json', { jsonSchema: { type: 'object' } })

    const result = await promise

    expect(result.structuredOutput).toEqual({
      questions: [{ prompt: 'Q?', choices: ['a', 'b'], correct: [0] }]
    })
    expect(events.some((e) => e.type === 'json_delta')).toBe(true)
    expect(events.some((e) => e.type === 'text_delta')).toBe(false)
  })

  it('skips garbage and unknown events', async () => {
    await expect(call('garbage').promise).resolves.toMatchObject({ text: 'ok' })
  })

  it('resolves on the result event without waiting for the process to exit', async () => {
    const started = Date.now()

    await call('linger', { killGraceMs: 100 }).promise

    expect(Date.now() - started).toBeLessThan(4000)
  })

  it.each([
    ['bad-model', 'bad_model'],
    ['not-logged-in', 'not_logged_in'],
    ['oauth-expired', 'not_logged_in'],
    ['rate-limit', 'quota_or_rate_limit'],
    ['crash', 'unknown'],
    ['no-result', 'unknown']
  ] as const)('maps the %s failure to %s', async (scenario, code) => {
    const error = await failure(call(scenario).promise)

    expect(error.code).toBe(code)
  })

  it('keeps the CLI message in a failure (is_error with subtype success)', async () => {
    const error = await failure(call('bad-model').promise)

    expect(error.message).toContain("There's an issue with the selected model")
  })

  it('cancels with SIGTERM and leaves no process behind', async () => {
    const controller = new AbortController()
    const { events, promise } = call('slow', { signal: controller.signal })
    while (!events.some((e) => e.type === 'text_delta')) await new Promise((r) => setTimeout(r, 10))

    controller.abort()
    const error = await failure(promise)

    expect(error.code).toBe('cancelled')
    expect(isAlive(fake.calls()[0]!.pid)).toBe(false)
  })

  it('rejects at once when the signal is already aborted, without spawning', async () => {
    const error = await failure(call('text', { signal: AbortSignal.abort() }).promise)

    expect(error.code).toBe('cancelled')
    expect(fake.calls()).toEqual([])
  })

  it('times out, then escalates to SIGKILL when SIGTERM is ignored', async () => {
    // Generous timings: under a loaded machine the fake CLI needs a while to start and to
    // install its SIGTERM handler, and to log its pid.
    const { promise } = call('stubborn', { timeoutMs: 3000, killGraceMs: 300 })

    const error = await failure(promise)

    expect(error.code).toBe('timeout')
    await expect.poll(() => fake.calls().length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(isAlive(fake.calls()[0]!.pid)).toBe(false)
  })

  it('reports cli_not_found when the binary does not exist', async () => {
    const error = await failure(call('text', { bin: join(fake.dir, 'missing') }).promise)

    expect(error.code).toBe('cli_not_found')
  })
})

describe('classifyCliFailure', () => {
  it('falls back to unknown', () => {
    expect(classifyCliFailure('Something odd happened')).toBe('unknown')
    expect(classifyCliFailure('Claude Code CLI exited with code 1.')).toBe('unknown')
  })

  it.each([
    // Seen on first use (#20), with the default profile's expired session.
    'Failed to authenticate: OAuth session expired and could not be refreshed',
    'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error"}}',
    'OAuth token has expired. Please obtain a new token or refresh your existing token.',
    'Not logged in · Please run /login',
    'Invalid API key · Please run /login',
    'API Error: 401 Unauthorized',
    'Authentication required'
  ])('classifies %j as not_logged_in', (text) => {
    expect(classifyCliFailure(text)).toBe('not_logged_in')
  })

  it.each([
    [
      "There's an issue with the selected model (claude-nope). [claude-code:unrecognized_model]",
      'bad_model'
    ],
    ['Claude AI usage limit reached|1760000000', 'quota_or_rate_limit'],
    ['API Error: 429 rate_limit_error', 'quota_or_rate_limit'],
    ['Credit balance is too low', 'quota_or_rate_limit'],
    ['API Error: 529 Overloaded', 'quota_or_rate_limit']
  ] as const)('keeps %j as %s', (text, code) => {
    expect(classifyCliFailure(text)).toBe(code)
  })

  it('tells what to do about an expired login, with the CLI message', () => {
    const error = cliFailure('Failed to authenticate: OAuth session expired')

    expect(error.code).toBe('not_logged_in')
    expect(error.message).toMatch(/CLAUDE_CONFIG_DIR=<dir> claude.*\/login.*config directory/)
    expect(error.message).toContain('(Failed to authenticate: OAuth session expired)')
  })
})

describe('Claude config directory', () => {
  it('sets CLAUDE_CONFIG_DIR when configured and inherits the environment otherwise', () => {
    const base = { PATH: '/usr/bin' }

    expect(cliEnv('/Users/me/.claude-perso', base)).toEqual({
      PATH: '/usr/bin',
      CLAUDE_CONFIG_DIR: '/Users/me/.claude-perso'
    })
    expect(cliEnv(null, base)).toBe(base)
    expect(cliEnv(undefined, base)).not.toHaveProperty('CLAUDE_CONFIG_DIR')
  })

  it('reaches the spawned CLI', async () => {
    const base: NodeJS.ProcessEnv = { ...fake.env }
    delete base['CLAUDE_CONFIG_DIR']

    await call('text', { env: cliEnv('/Users/me/.claude-perso', base) }).promise
    await call('text', { env: cliEnv(null, base) }).promise

    expect(fake.calls().map((c) => c.configDir)).toEqual(['/Users/me/.claude-perso', null])
  })
})
