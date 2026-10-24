import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { watchTheme, type DarkQuery } from './watchTheme'

/** A fake `prefers-color-scheme: dark` media query that can change. */
function fakeQuery(matches: boolean) {
  const listeners = new Set<() => void>()
  const query: DarkQuery & { set(value: boolean): void } = {
    matches,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    set(value) {
      query.matches = value
      for (const listener of listeners) listener()
    }
  }
  return { query, listeners }
}

describe('watchTheme', () => {
  it('sets data-theme at once and follows the media query', () => {
    const root = { dataset: {} as Record<string, string | undefined> }
    const { query, listeners } = fakeQuery(false)
    const stop = watchTheme(root, query)
    expect(root.dataset['theme']).toBe('light')
    query.set(true)
    expect(root.dataset['theme']).toBe('dark')
    query.set(false)
    expect(root.dataset['theme']).toBe('light')
    stop()
    expect(listeners.size).toBe(0)
    query.set(true)
    expect(root.dataset['theme']).toBe('light')
  })
})

describe('theme-init.js (no flash at startup)', () => {
  const script = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8')

  /** Runs the startup script against a fake page whose media query says `dark`. */
  const run = (dark: boolean) => {
    const documentElement = { dataset: {} as Record<string, string | undefined> }
    const queries: string[] = []
    runInNewContext(script, {
      document: { documentElement },
      window: {
        matchMedia: (query: string) => {
          queries.push(query)
          return { matches: dark }
        }
      }
    })
    return { theme: documentElement.dataset['theme'], queries }
  }

  it('resolves the theme from the media query, synchronously', () => {
    expect(run(true)).toEqual({ theme: 'dark', queries: ['(prefers-color-scheme: dark)'] })
    expect(run(false).theme).toBe('light')
  })

  it('is a classic blocking script of index.html, placed before the module entry', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const tag = /<script src="\.\/theme-init\.js"><\/script>/.exec(html)
    expect(tag).not.toBeNull()
    expect(tag?.[0]).not.toMatch(/\b(async|defer|type=)/)
    expect(html.indexOf('theme-init.js')).toBeLessThan(html.indexOf('type="module"'))
    expect(html.indexOf('theme-init.js')).toBeLessThan(html.indexOf('</head>'))
  })
})
