// Fakes shared by the App Update tests: an HTTP client that serves a table, and a command runner
// that records its calls.
import { writeFile } from 'node:fs/promises'
import type { CommandRunner } from '../commands'
import { UpdateError } from '../errors'
import type { HttpClient } from '../http'

/** Serves `files` by URL; a missing URL is a network error. Records the requested URLs. */
export function fakeHttp(files: Record<string, string | Buffer | Error>): HttpClient & {
  requests: string[]
} {
  const requests: string[] = []
  const get = (url: string) => {
    requests.push(url)
    const file = files[url]
    if (file === undefined) throw new UpdateError('network', `no such file: ${url}`)
    if (file instanceof Error) throw file
    return file
  }
  return {
    requests,
    getJson: (url) => Promise.resolve().then(() => JSON.parse(String(get(url))) as unknown),
    getText: (url) => Promise.resolve().then(() => String(get(url))),
    download: async (url, destination, onProgress) => {
      const content = get(url)
      await writeFile(destination, content)
      const size = Buffer.byteLength(content)
      onProgress?.(size, size)
    }
  }
}

export type RecordedCall = { file: string; args: string[] }

/** Records every command; `handlers` may act on a command (create files) or throw to fail it. */
export function fakeRunner(
  handlers: Record<string, (args: string[]) => Promise<string | void> | string | void> = {}
): CommandRunner & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const run: CommandRunner = async (file, args) => {
    calls.push({ file, args })
    const stdout = (await handlers[file]?.(args)) ?? ''
    return { stdout, stderr: '' }
  }
  return Object.assign(run, { calls })
}
