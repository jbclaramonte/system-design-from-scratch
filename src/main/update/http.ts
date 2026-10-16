// The only network code of App Updates: JSON and text lookups, and file downloads. Injectable
// (`fetch`) so the rest of the module is tested with fakes, never against the real GitHub.
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { UpdateError } from './errors'

export interface HttpClient {
  getJson(url: string): Promise<unknown>
  getText(url: string): Promise<string>
  /** Streams the body to `destination`; `total` is null when the server announced no size. */
  download(
    url: string,
    destination: string,
    onProgress?: (received: number, total: number | null) => void
  ): Promise<void>
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
/** Release lookups and checksum files are small; anything bigger is not what we asked for. */
const MAX_TEXT_BYTES = 2_000_000

/** HTTPS only, except plain HTTP to this machine (the local fake release of the tests). */
export function isAllowedUrl(text: string): boolean {
  try {
    const url = new URL(text)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.host.replace(/:\d+$/, '')))
    )
  } catch {
    return false
  }
}

export interface HttpClientOptions {
  /** Abort a request that sends nothing for this long. Default 30 seconds. */
  idleTimeoutMs?: number
}

export function createHttpClient(
  fetchImpl: typeof fetch = fetch,
  { idleTimeoutMs = 30_000 }: HttpClientOptions = {}
): HttpClient {
  /** Runs `use` on a successful response; the idle timer covers the headers and every chunk. */
  async function withResponse<T>(
    url: string,
    use: (response: Response, touch: () => void) => Promise<T>
  ): Promise<T> {
    if (!isAllowedUrl(url)) {
      throw new UpdateError('network', `The update address ${url} is not a secure (https) address.`)
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const touch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), idleTimeoutMs)
    }
    touch()
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json, */*',
          'User-Agent': 'system-design-from-scratch'
        }
      })
      // Redirects are followed (release assets redirect to GitHub's storage): never to http.
      if (response.url && !isAllowedUrl(response.url)) {
        await response.body?.cancel()
        throw new UpdateError('network', 'The download was redirected to an insecure address.')
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new UpdateError('network', statusMessage(response.status))
      }
      return await use(response, touch)
    } catch (error) {
      if (error instanceof UpdateError) throw error
      if (controller.signal.aborted) {
        throw new UpdateError('network', 'GitHub did not answer in time. Check your connection.', {
          cause: error
        })
      }
      throw new UpdateError(
        'network',
        'Could not reach GitHub. Check your connection and try again.',
        { cause: error }
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async function readText(response: Response, touch: () => void): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) return ''
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      touch()
      size += value.length
      if (size > MAX_TEXT_BYTES) {
        await reader.cancel()
        throw new UpdateError('invalid_release', 'GitHub answered with an unexpectedly large file.')
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  return {
    getText: (url) => withResponse(url, readText),

    getJson: (url) =>
      withResponse(url, readText).then((text) => {
        try {
          return JSON.parse(text) as unknown
        } catch (error) {
          throw new UpdateError(
            'invalid_release',
            'GitHub answered with something that is not JSON.',
            {
              cause: error
            }
          )
        }
      }),

    download: (url, destination, onProgress) =>
      withResponse(url, async (response, touch) => {
        if (!response.body) throw new UpdateError('network', 'The download has no content.')
        const announced = Number(response.headers.get('content-length'))
        const total = Number.isFinite(announced) && announced > 0 ? announced : null
        let received = 0
        const body = Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>)
        body.on('data', (chunk: Buffer) => {
          touch()
          received += chunk.length
          onProgress?.(received, total)
        })
        await pipeline(body, createWriteStream(destination, { mode: 0o600 }))
        if (total !== null && received !== total) {
          throw new UpdateError('network', 'The download was interrupted before the end.')
        }
      })
  }
}

function statusMessage(status: number): string {
  if (status === 403 || status === 429) {
    return 'GitHub is limiting requests from this connection. Try again in a while.'
  }
  if (status === 404) return 'GitHub has no such release or file (404).'
  return `GitHub answered with an error (HTTP ${status}).`
}
