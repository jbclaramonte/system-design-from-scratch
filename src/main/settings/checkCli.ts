import { spawn } from 'node:child_process'
import { GenerationError } from '../generation/errors'
import { resolveCliPath, type ResolveCliOptions } from '../generation/resolveCli'
import type { CliCheck } from '../../shared/settings'

/** Runs `<bin> --version` (stdin closed, timeout), resolving with its first output line. */
function cliVersion(bin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(
        new GenerationError('timeout', `${bin} --version did not answer within ${timeoutMs} ms.`)
      )
    }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GenerationError('cli_not_found', `Could not run ${bin}: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const version = stdout.trim().split('\n')[0]?.trim()
      if (code === 0 && version) resolve(version)
      else
        reject(
          new GenerationError(
            'unknown',
            `${bin} --version failed (exit ${code}). ${stderr.trim() || stdout.trim()}`.trim()
          )
        )
    })
  })
}

/**
 * Resolves the Claude Code CLI like the Generation service does (configured path first, no
 * silent fallback) and asks it for its version. Never throws: the result says what failed.
 */
export async function checkCli(
  options: ResolveCliOptions & { timeoutMs?: number } = {}
): Promise<CliCheck> {
  try {
    const path = await resolveCliPath(options)
    return { ok: true, path, version: await cliVersion(path, options.timeoutMs ?? 10_000) }
  } catch (error) {
    const failure =
      error instanceof GenerationError
        ? error
        : new GenerationError('unknown', error instanceof Error ? error.message : String(error))
    return { ok: false, error: failure.toInfo() }
  }
}
