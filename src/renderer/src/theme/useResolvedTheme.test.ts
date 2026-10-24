import { describe, expect, it } from 'vitest'
import { observeTheme, resolvedThemeOf } from './useResolvedTheme'

describe('resolvedThemeOf', () => {
  it('reads data-theme, Dark when it is not set', () => {
    expect(resolvedThemeOf({ dataset: { theme: 'light' } })).toBe('light')
    expect(resolvedThemeOf({ dataset: { theme: 'dark' } })).toBe('dark')
    expect(resolvedThemeOf({ dataset: {} })).toBe('dark')
  })
})

describe('observeTheme', () => {
  it('listens to data-theme only, and stops on cleanup', () => {
    const seen: { target: unknown; options: MutationObserverInit }[] = []
    let notify = () => {}
    let disconnected = 0
    class FakeObserver {
      constructor(callback: () => void) {
        notify = callback
      }
      observe(target: Element, options: MutationObserverInit) {
        seen.push({ target, options })
      }
      disconnect() {
        disconnected += 1
      }
    }
    const root = {} as Element
    let calls = 0
    const stop = observeTheme(root, () => (calls += 1), FakeObserver)
    expect(seen).toEqual([
      { target: root, options: { attributes: true, attributeFilter: ['data-theme'] } }
    ])
    notify()
    expect(calls).toBe(1)
    stop()
    expect(disconnected).toBe(1)
  })
})
