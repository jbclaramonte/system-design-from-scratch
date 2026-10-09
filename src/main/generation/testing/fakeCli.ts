import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface FakeCliCall {
  argv: string[]
  cwd: string
  cwdEntries: string[]
  stdin: string
  /** Image blocks of a stream-json input. */
  images: number
  pid: number
  /** `CLAUDE_CONFIG_DIR` as the call saw it. */
  configDir: string | null
}

export interface FakeCli {
  dir: string
  /** Absolute path of the fake `claude` executable. */
  bin: string
  /** Env to pass to the runner so calls are logged. */
  env: NodeJS.ProcessEnv
  calls(): FakeCliCall[]
  cleanup(): void
}

/** Installs an executable `claude` in a fresh temp dir that runs fakeClaude.mts. */
export function installFakeCli(): FakeCli {
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'))
  const bin = join(dir, 'claude')
  const log = join(dir, 'calls.jsonl')
  const script = pathToFileURL(join(import.meta.dirname, 'fakeClaude.mts')).href
  writeFileSync(bin, `#!${process.execPath}\nimport(${JSON.stringify(script)})\n`)
  chmodSync(bin, 0o755)
  return {
    dir,
    bin,
    env: { ...process.env, FAKE_CLAUDE_LOG: log },
    calls() {
      try {
        return readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as FakeCliCall)
      } catch {
        return []
      }
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

/** True while a process with this pid exists. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
