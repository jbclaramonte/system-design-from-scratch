// Running system commands (hdiutil, ditto, codesign, plutil), injectable for tests.
import { execFile } from 'node:child_process'

export interface CommandResult {
  stdout: string
  stderr: string
}

/** Runs `file` with `args` (no shell). Rejects with the command's stderr when it fails. */
export type CommandRunner = (
  file: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<CommandResult>

export const runCommand: CommandRunner = (file, args, { timeoutMs = 120_000 } = {}) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 4_000_000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = (stderr || stdout || error.message).toString().trim().split('\n').pop()
        reject(new Error(detail || error.message, { cause: error }))
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() })
      }
    })
  })
