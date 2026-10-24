/*
 * Theme at startup, before the first paint (docs/Design System.md, "Theme"). A classic script in
 * the <head> of index.html: it blocks rendering, so the page never shows the wrong theme.
 *
 * The main process sets Electron's native theme from the Theme setting before the window opens,
 * so `prefers-color-scheme` already says which look to show: Light or Dark as chosen, the
 * operating system's preference for System. This script only copies it to `data-theme`, which
 * selects the token set of design-tokens.css. `src/theme/watchTheme.ts` keeps it up to date.
 */
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light'
