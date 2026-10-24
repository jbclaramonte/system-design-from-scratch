/**
 * The Theme: the look of the app, Light (the "Warm" theme) or Dark ("Terminal Architect"). A
 * setting: System follows the operating system and is the default. Shared by the main process
 * (native theme, window background) and the renderer (Settings screen, `data-theme`).
 */
export const themes = ['system', 'light', 'dark'] as const
export type Theme = (typeof themes)[number]

/** The look actually shown: what a Theme resolves to. */
export type ResolvedTheme = Exclude<Theme, 'system'>

export const DEFAULT_THEME: Theme = 'system'

/** Names for the Settings screen and the docs. */
export const themeLabels: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
}

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (themes as readonly string[]).includes(value)

/** System follows the operating system's preference; Light and Dark are explicit. */
export const resolveTheme = (theme: Theme, systemPrefersDark: boolean): ResolvedTheme =>
  theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme

/**
 * Background of the native window, shown before the page paints (no flash of the other theme).
 * Equal to `--color-canvas` of each theme; a unit test checks it against design-tokens.css.
 */
export const themeWindowBackground: Record<ResolvedTheme, string> = {
  light: '#fff8f5',
  dark: '#06080d'
}
