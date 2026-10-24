import { resolveTheme, type ResolvedTheme } from '../../../shared/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The part of `MediaQueryList` the watcher uses (a test passes a fake). */
export interface DarkQuery {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/** The part of the root element the watcher writes to. */
export interface ThemeRoot {
  dataset: Record<string, string | undefined>
}

/** Writes the look to show on the root element: `data-theme` selects the tokens. */
export function applyResolvedTheme(root: ThemeRoot, resolved: ResolvedTheme): void {
  root.dataset['theme'] = resolved
}

/**
 * Keeps `data-theme` on the root element equal to `prefers-color-scheme`. The main process points
 * that media query at the Theme setting (native theme), so a change in Settings and a change of
 * the operating system under System both arrive here. Returns the function that stops watching.
 */
export function watchTheme(
  root: ThemeRoot = document.documentElement,
  query: DarkQuery = window.matchMedia(DARK_QUERY)
): () => void {
  const update = () => applyResolvedTheme(root, resolveTheme('system', query.matches))
  update()
  query.addEventListener('change', update)
  return () => query.removeEventListener('change', update)
}
