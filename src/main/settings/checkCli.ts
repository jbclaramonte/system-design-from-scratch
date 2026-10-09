import { spawn } from 'node:child_process'
import { z } from 'zod'
import { cliEnv } from '../generation/cliRunner'
import { GenerationError } from '../generation/errors'
import { resolveCliPath, type ResolveCliOptions } from '../generation/resolveCli'
import type { CliAuthStatus, CliCheck } from '../../shared/settings'

interface CommandOutput {
  code: number | null
  stdout: string
  stderr: string
}

/** Runs `<bin> <args>` (stdin closed, timeout) and resolves with its exit code and output. */
function runCommand(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<CommandOutput> {
  const command = [bin, ...args].join(' ')
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new GenerationError('timeout', `${command} did not answer within ${timeoutMs} ms.`))
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GenerationError('cli_not_found', `Could not run ${bin}: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** `<bin> --version`, resolving with its first output line. */
async function cliVersion(bin: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  const { code, stdout, stderr } = await runCommand(bin, ['--version'], env, timeoutMs)
  const version = stdout.trim().split('\n')[0]?.trim()
  if (code === 0 && version) return version
  throw new GenerationError(
    'unknown',
    `${bin} --version failed (exit ${code}). ${stderr.trim() || stdout.trim()}`.trim()
  )
}

// Output of `claude auth status --json` (Claude Code 2.1): extra fields are ignored.
const authStatusOutput = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
  apiProvider: z.string().optional(),
  email: z.string().optional(),
  configDirectory: z.string().optional()
})

/** Parses the JSON printed by `claude auth status --json`; undefined when it is not that shape. */
export function parseAuthStatus(stdout: string): CliAuthStatus | undefined {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    return undefined
  }
  const parsed = authStatusOutput.safeParse(json)
  if (!parsed.success) return undefined
  const { loggedIn, authMethod, apiProvider, email, configDirectory } = parsed.data
  return {
    loggedIn,
    authMethod: authMethod ?? 'unknown',
    apiProvider: apiProvider ?? null,
    email: email ?? null,
    configDirectory: configDirectory ?? null
  }
}

/** `<bin> auth status --json`: no model call. It exits with 1 when logged out, still printing JSON. */
async function cliAuthStatus(bin: string, env: NodeJS.ProcessEnv, timeoutMs: number) {
  const { code, stdout, stderr } = await runCommand(
    bin,
    ['auth', 'status', '--json'],
    env,
    timeoutMs
  )
  const status = parseAuthStatus(stdout)
  if (status) return status
  throw new GenerationError(
    'unknown',
    `${bin} auth status --json failed (exit ${code}). ${stderr.trim() || stdout.trim()}`.trim()
  )
}

const toFailure = (error: unknown) =>
  error instanceof GenerationError
    ? error
    : new GenerationError('unknown', error instanceof Error ? error.message : String(error))

/**
 * Resolves the Claude Code CLI like the Generation service does (configured path first, no
 * silent fallback), asks it for its version, then for the login state of the profile set by
 * `configDir` (`CLAUDE_CONFIG_DIR`, inherited when absent). Never throws: the result says what
 * failed.
 */
export async function checkCli(
  options: ResolveCliOptions & { configDir?: string | null; timeoutMs?: number } = {}
): Promise<CliCheck> {
  const timeoutMs = options.timeoutMs ?? 10_000
  const env = cliEnv(options.configDir, options.env)
  try {
    const path = await resolveCliPath(options)
    const version = await cliVersion(path, env, timeoutMs)
    const auth = await cliAuthStatus(path, env, timeoutMs).then(
      (status) => ({ ok: true as const, status }),
      (error: unknown) => ({ ok: false as const, error: toFailure(error).toInfo() })
    )
    return { ok: true, path, version, auth }
  } catch (error) {
    return { ok: false, error: toFailure(error).toInfo() }
  }
}
