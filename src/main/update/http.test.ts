import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHttpClient, isAllowedUrl } from './http'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sdfs-http-test-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

/** A fetch that answers with `respond(url)`; `url` of the response defaults to the request's. */
const fetchOf =
  (respond: (url: string) => Response | Error): typeof fetch =>
  async (input) => {
    const url = String(input)
    const answer = respond(url)
    if (answer instanceof Error) throw answer
    return answer.url ? answer : Object.defineProperty(answer, 'url', { value: url })
  }

describe('isAllowedUrl', () => {
  it('allows https, and http only to this machine', () => {
    expect(isAllowedUrl('https://api.github.com/repos/o/r/releases/latest')).toBe(true)
    expect(isAllowedUrl('http://127.0.0.1:8080/latest')).toBe(true)
    expect(isAllowedUrl('http://localhost:3000/x')).toBe(true)
    expect(isAllowedUrl('http://example.com/x')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1.example.com/x')).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('not a url')).toBe(false)
  })
})

describe('createHttpClient', () => {
  it('reads JSON and text', async () => {
    const http = createHttpClient(
      fetchOf((url) => new Response(url.endsWith('json') ? '{"a":1}' : 'text'))
    )
    await expect(http.getJson('https://x.test/file.json')).resolves.toEqual({ a: 1 })
    await expect(http.getText('https://x.test/file.txt')).resolves.toBe('text')
  })

  it('turns an offline failure into a readable network error', async () => {
    const http = createHttpClient(fetchOf(() => new TypeError('fetch failed')))
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({
      code: 'network',
      message: expect.stringContaining('Could not reach GitHub')
    })
  })

  it('explains HTTP errors in words', async () => {
    const answers: Record<string, number> = {
      'https://x.test/404': 404,
      'https://x.test/403': 403,
      'https://x.test/500': 500
    }
    const http = createHttpClient(fetchOf((url) => new Response('', { status: answers[url] })))
    await expect(http.getJson('https://x.test/404')).rejects.toMatchObject({
      message: expect.stringContaining('404')
    })
    await expect(http.getJson('https://x.test/403')).rejects.toMatchObject({
      message: expect.stringContaining('limiting')
    })
    await expect(http.getJson('https://x.test/500')).rejects.toMatchObject({
      message: expect.stringContaining('HTTP 500')
    })
  })

  it('rejects an answer that is not JSON', async () => {
    const http = createHttpClient(fetchOf(() => new Response('<html>')))
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({
      code: 'invalid_release'
    })
  })

  it('never requests an insecure address', async () => {
    let requested = false
    const http = createHttpClient(fetchOf(() => ((requested = true), new Response('{}'))))
    await expect(http.getJson('http://example.com/a')).rejects.toMatchObject({ code: 'network' })
    expect(requested).toBe(false)
  })

  it('refuses a redirect to an insecure address', async () => {
    const http = createHttpClient(async () =>
      Object.defineProperty(new Response('{}'), 'url', { value: 'http://example.com/elsewhere' })
    )
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({
      message: expect.stringContaining('insecure')
    })
  })

  it('refuses an answer that is far too large', async () => {
    const http = createHttpClient(fetchOf(() => new Response('x'.repeat(2_100_000))))
    await expect(http.getText('https://x.test/a')).rejects.toMatchObject({
      code: 'invalid_release'
    })
  })

  it('downloads a file and reports its progress', async () => {
    const body = Buffer.from('dmg-bytes'.repeat(1000))
    const http = createHttpClient(
      fetchOf(() => new Response(body, { headers: { 'content-length': String(body.length) } }))
    )
    const seen: [number, number | null][] = []
    const file = join(dir, 'a.dmg')
    await http.download('https://x.test/a.dmg', file, (received, total) =>
      seen.push([received, total])
    )
    expect(await readFile(file)).toEqual(body)
    expect(seen.at(-1)).toEqual([body.length, body.length])
  })

  it('fails a download that ends before its announced size', async () => {
    const http = createHttpClient(
      fetchOf(() => new Response('short', { headers: { 'content-length': '500' } }))
    )
    await expect(http.download('https://x.test/a.dmg', join(dir, 'a.dmg'))).rejects.toBeInstanceOf(
      Error
    )
  })

  it('aborts a request that stays silent', async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const http = createHttpClient(hang, { idleTimeoutMs: 20 })
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({
      message: expect.stringContaining('did not answer in time')
    })
  })
})
