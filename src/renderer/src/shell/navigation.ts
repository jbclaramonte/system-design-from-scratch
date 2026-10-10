import type { TopicMasterySummary } from '../../../shared/mastery'

/**
 * The screens of the app. The Learning Path (`home`) is the main screen; every other screen
 * returns to it. To add a screen: add it here, give it a nav item and a layout below, render it
 * in `App`.
 */
export type Screen =
  | { name: 'home' }
  /** `from`: the screen the back button returns to (the Learning Path by default). */
  | { name: 'topic'; topic: TopicMasterySummary; from?: 'dashboard' }
  | { name: 'dashboard' }
  | { name: 'exercise'; designExerciseId: number }
  /** `back`: the screen to return to when opened from an error ("Open Settings"). */
  | { name: 'settings'; back?: Screen }
  | { name: 'about' }
  // Dev builds only:
  | { name: 'dev-topics' }
  | { name: 'dev-lessons' }
  | { name: 'dev-quiz' }
  | { name: 'dev-design-canvas' }
  | { name: 'dev-design-exercise' }
  | { name: 'dev-diagrams' }

/** An entry of the header navigation. */
export type NavItemId = 'learning-path' | 'dashboard' | 'settings' | 'about'

/** The header navigation, in display order. `learning-path` is the Learning Path home. */
export const NAV_ITEMS: readonly { id: NavItemId; label: string; testId: string }[] = [
  { id: 'learning-path', label: 'Learning Path', testId: 'open-learning-path' },
  { id: 'dashboard', label: 'Dashboard', testId: 'open-dashboard' },
  { id: 'settings', label: 'Settings', testId: 'open-settings' },
  { id: 'about', label: 'About', testId: 'open-about' }
]

/**
 * The nav item highlighted for a screen. Screens reached from the Learning Path (topics,
 * exercises, dev tools) keep Learning Path highlighted; a topic opened from the Dashboard keeps
 * Dashboard highlighted.
 */
export function activeNavItem(screen: Screen): NavItemId {
  switch (screen.name) {
    case 'dashboard':
      return 'dashboard'
    case 'topic':
      return screen.from === 'dashboard' ? 'dashboard' : 'learning-path'
    case 'settings':
      return 'settings'
    case 'about':
      return 'about'
    case 'home':
    case 'exercise':
    case 'dev-topics':
    case 'dev-lessons':
    case 'dev-quiz':
    case 'dev-design-canvas':
    case 'dev-design-exercise':
    case 'dev-diagrams':
      return 'learning-path'
  }
}

/**
 * How a screen sits in the shell:
 * - `page`: centered container, the content flows and the page scrolls (Learning Path, Dashboard,
 *   Settings, About).
 * - `fill`: centered container, the screen fills the height and scrolls its own panes (topic).
 * - `canvas`: full width and height, no padding (Design Exercise and the canvas).
 */
export type ShellLayout = 'page' | 'fill' | 'canvas'

export function screenLayout(screen: Screen): ShellLayout {
  switch (screen.name) {
    case 'exercise':
    case 'dev-design-canvas':
    case 'dev-design-exercise':
      return 'canvas'
    case 'topic':
    case 'dev-topics':
    case 'dev-lessons':
    case 'dev-diagrams':
      return 'fill'
    case 'home':
    case 'dashboard':
    case 'settings':
    case 'about':
    case 'dev-quiz':
      return 'page'
  }
}
