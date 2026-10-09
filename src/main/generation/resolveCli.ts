import { execFile } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { GenerationError } from './errors'

const BINARY_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude'

export interface ResolveCliOptions {
  /** Path set by the user. When set, it must exist: no silent fallback to another install. */
  configuredPath?: string
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** Defaults to `os.homedir()`. */
  home?: string
  /** Login shell used for the last fallback. Defaults to `$SHELL`, then `/bin/zsh`. */
  shell?: string
  /** Set to false to skip the login shell fallback. */
  useLoginShell?: boolean
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Install locations to try when `claude` is not on PATH (a GUI-launched app gets a minimal PATH). */
export function commonCliLocations(home: string, env: NodeJS.ProcessEnv): string[] {
  const dirs = [
    join(home, '.claude', 'local'),
    join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.npm-global', 'bin'),
    env['npm_config_prefix'] && join(env['npm_config_prefix'], 'bin')
  ]
  return dirs.filter((dir): dir is string => Boolean(dir)).map((dir) => join(dir, BINARY_NAME))
}

/** Asks a login shell for `command -v claude`, so the user's profile PATH applies. */
function lookupInLoginShell(shell: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      shell,
      ['-lc', `command -v ${BINARY_NAME}`],
      { env, timeout: 5000, encoding: 'utf8' },
      (error, stdout) => {
        // An alias prints its definition instead of a path: only accept an absolute path.
        const path = error ? '' : stdout.trim().split('\n').pop()?.trim()
        resolve(path && isAbsolute(path) && isExecutableFile(path) ? path : undefined)
      }
    )
  })
}

/**
 * Resolves the absolute path of the `claude` binary: the configured path, then PATH, then common
 * install locations, then a login shell lookup. Throws `cli_not_found` with what was tried.
 */
export async function resolveCliPath(options: ResolveCliOptions = {}): Promise<string> {
  const env = options.env ?? process.env

  if (options.configuredPath) {
    if (isExecutableFile(options.configuredPath)) return options.configuredPath
    throw new GenerationError(
      'cli_not_found',
      `Claude Code CLI not found at the configured path ${options.configuredPath}. Fix or clear the path in the settings.`
    )
  }

  const pathDirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean)
  const candidates = [
    ...pathDirs.map((dir) => join(dir, BINARY_NAME)),
    ...commonCliLocations(options.home ?? homedir(), env)
  ]
  const found = candidates.find(isExecutableFile)
  if (found) return found

  if (options.useLoginShell !== false && process.platform !== 'win32') {
    const shell = options.shell ?? env['SHELL'] ?? '/bin/zsh'
    const fromShell = await lookupInLoginShell(shell, env)
    if (fromShell) return fromShell
  }

  throw new GenerationError('cli_not_found')
}
