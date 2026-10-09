import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cliFailure, GenerationError } from './errors'
import { createLineSplitter, parseStreamLine, type CliEvent, type CliResult } from './streamJson'

/**
 * Flags that strip the user's Claude Code configuration (hooks, plugins, MCP servers, settings,
 * skills, tools) from every call. Without them a call loads 20-45k tokens of unrelated context
 * and takes 1 s longer to start (docs/spikes/cli-latency.md). Keep them together.
 */
export const ISOLATION_FLAGS = [
  '--no-session-persistence',
  '--tools',
  '',
  '--setting-sources',
  '',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--safe-mode'
] as const

export const DEFAULT_MODEL = 'sonnet'
export const DEFAULT_EFFORT = 'low'
export const DEFAULT_TIMEOUT_MS = 120_000
/** Time between SIGTERM and SIGKILL. A SIGTERM-ed CLI exits in about 0.5 s. */
export const DEFAULT_KILL_GRACE_MS = 3_000
/** The CLI exits about 0.45 s after its `result` event; kill it if it lingers longer than this. */
const LINGER_AFTER_RESULT_MS = 5_000

/** An image content block (base64, no `data:` prefix). */
export interface CliImage {
  mediaType: 'image/png'
  base64: string
}

export interface CliCallOptions {
  /** Absolute path of the `claude` binary (see resolveCliPath). */
  bin: string
  /** Sent on stdin, so there is no argv size limit for big grounding excerpts. */
  prompt: string
  systemPrompt: string
  /**
   * Images sent with the prompt. The prompt then goes on stdin as one stream-json user message
   * (`--input-format stream-json`): image blocks first, then the text.
   */
  images?: CliImage[]
  model?: string
  /** `--effort` level; null omits the flag. */
  effort?: string | null
  /** JSON schema passed to `--json-schema`: the CLI enforces it and returns `structured_output`. */
  jsonSchema?: object
  signal?: AbortSignal
  timeoutMs?: number
  killGraceMs?: number
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  onEvent?: (event: CliEvent) => void
}

export function buildCliArgs(options: CliCallOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    // Required by the CLI for stream-json in print mode.
    '--verbose',
    ...ISOLATION_FLAGS,
    '--model',
    options.model ?? DEFAULT_MODEL
  ]
  const effort = options.effort === undefined ? DEFAULT_EFFORT : options.effort
  if (effort) args.push('--effort', effort)
  args.push('--system-prompt', options.systemPrompt)
  if (options.jsonSchema) args.push('--json-schema', JSON.stringify(options.jsonSchema))
  if (options.images?.length) args.push('--input-format', 'stream-json')
  return args
}

/**
 * The CLI environment with `CLAUDE_CONFIG_DIR` set to the configured Claude profile directory.
 * Without one, the environment is inherited as is (the CLI then uses `~/.claude` unless the app
 * itself was started with `CLAUDE_CONFIG_DIR`).
 */
export function cliEnv(
  configDir: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return configDir ? { ...env, CLAUDE_CONFIG_DIR: configDir } : env
}

/** What goes on stdin: the prompt text, or one stream-json user message when images are sent. */
export function buildCliInput(options: Pick<CliCallOptions, 'prompt' | 'images'>): string {
  if (!options.images?.length) return options.prompt
  const content = [
    ...options.images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 }
    })),
    { type: 'text', text: options.prompt }
  ]
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`
}

function spawnFailure(error: NodeJS.ErrnoException, bin: string): GenerationError {
  if (error.code === 'ENOENT' || error.code === 'EACCES') {
    return new GenerationError(
      'cli_not_found',
      `Claude Code CLI could not be started from ${bin} (${error.code}). Install it or fix its path in the settings.`,
      { cause: error }
    )
  }
  return new GenerationError('unknown', `Claude Code CLI could not be started: ${error.message}`, {
    cause: error
  })
}

/**
 * Runs one CLI call in an empty temp directory and resolves with its `result` event. Streams
 * parsed events to `onEvent`. Rejects with a GenerationError; on cancel or timeout it sends
 * SIGTERM, then SIGKILL after `killGraceMs`, and only rejects once the process has exited.
 */
export function runCli(options: CliCallOptions): Promise<CliResult> {
  const { signal } = options
  if (signal?.aborted) return Promise.reject(new GenerationError('cancelled'))

  return new Promise((resolve, reject) => {
    // Empty cwd: no CLAUDE.md or project settings to discover.
    const cwd = mkdtempSync(join(tmpdir(), 'sdfs-generation-'))
    let child: ChildProcess
    try {
      child = spawn(options.bin, buildCliArgs(options), {
        cwd,
        env: options.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) {
      rmSync(cwd, { recursive: true, force: true })
      reject(spawnFailure(error as NodeJS.ErrnoException, options.bin))
      return
    }

    let failure: GenerationError | undefined
    let result: CliResult | undefined
    let settled = false
    let finished = false
    let stderr = ''
    let killTimer: NodeJS.Timeout | undefined
    let lingerTimer: NodeJS.Timeout | undefined
    const exited = () => child.exitCode !== null || child.signalCode !== null

    const kill = () => {
      if (exited() || killTimer) return
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (!exited()) child.kill('SIGKILL')
      }, options.killGraceMs ?? DEFAULT_KILL_GRACE_MS)
    }

    const settle = (outcome: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      signal?.removeEventListener('abort', onAbort)
      outcome()
    }

    const onAbort = () => {
      failure ??= new GenerationError('cancelled')
      kill()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const timeoutTimer = setTimeout(() => {
      failure ??= new GenerationError('timeout')
      kill()
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    const finish = (code: number | null) => {
      if (finished) return
      finished = true
      clearTimeout(killTimer)
      clearTimeout(lingerTimer)
      rmSync(cwd, { recursive: true, force: true })
      settle(() => {
        if (failure) reject(failure)
        else if (result?.isError) reject(cliFailure(`${result.text}\n${stderr}`))
        else if (result) resolve(result)
        else if (code !== 0)
          reject(cliFailure(stderr || `Claude Code CLI exited with code ${code}.`))
        else reject(new GenerationError('unknown', 'Claude Code CLI exited without a result.'))
      })
    }

    const lines = createLineSplitter((line) => {
      const event = parseStreamLine(line)
      if (!event || settled) return
      options.onEvent?.(event)
      if (event.type !== 'result') return
      result = event.result
      // A successful result is the completion: do not wait for the process teardown.
      if (!result.isError && !failure) {
        settle(() => resolve(event.result))
        lingerTimer = setTimeout(kill, LINGER_AFTER_RESULT_MS)
      }
    })

    child.stdout!.setEncoding('utf8')
    child.stdout!.on('data', (chunk: string) => lines.push(chunk))
    child.stdout!.on('end', () => lines.flush())
    child.stderr!.setEncoding('utf8')
    child.stderr!.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdin!.on('error', () => {})
    child.stdin!.end(buildCliInput(options))

    child.on('error', (error: NodeJS.ErrnoException) => {
      failure ??= spawnFailure(error, options.bin)
      // A process that never started emits no `close`.
      if (child.pid === undefined) finish(null)
    })
    child.on('close', (code) => finish(code))
  })
}
