import { useSyncExternalStore } from 'react'
import type { ResolvedTheme } from '../../../shared/theme'

/** The part of the root element the hook reads. */
export interface ThemeSource {
  dataset: Record<string, string | undefined>
}

/** The look shown on `root`: its `data-theme`, Dark until the attribute is set (as the tokens do). */
export function resolvedThemeOf(root: ThemeSource): ResolvedTheme {
  return root.dataset['theme'] === 'light' ? 'light' : 'dark'
}

/** Minimal observer constructor (a test passes a fake). */
type ObserverConstructor = new (callback: () => void) => {
  observe(target: Element, options: MutationObserverInit): void
  disconnect(): void
}

/**
 * Calls `listener` when `data-theme` changes on `root`, whoever writes it (`watchTheme`, an
 * explicit theme in a test). Returns the function that stops listening.
 */
export function observeTheme(
  root: Element,
  listener: () => void,
  Observer: ObserverConstructor = MutationObserver
): () => void {
  const observer = new Observer(listener)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

const subscribe = (listener: () => void) => observeTheme(document.documentElement, listener)
const snapshot = () => resolvedThemeOf(document.documentElement)

/**
 * The look currently shown (`light` or `dark`), updated when `data-theme` changes. For what takes
 * its colors from JavaScript (Mermaid, the Design Canvas); everything else follows the tokens.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, snapshot, () => 'dark')
}
