import type { Mermaid, MermaidConfig } from 'mermaid'
import { DIAGRAM_LIMITS, diagramErrorFromException, type DiagramError } from './diagramSource'
import type { ResolvedTheme } from '../../../shared/theme'
import { diagramFontFamily, mermaidThemeVariables } from './mermaidTheme'

// Lazy, single mermaid instance for the renderer. `mermaid` (and the chunk of each diagram type)
// is only fetched by the first diagram on screen, so the main bundle does not grow.

/** A render that has not settled after this is reported as `timeout` (see docs/Mermaid Diagrams.md). */
export const RENDER_TIMEOUT_MS = 10_000

export type RenderResult = { ok: true; svg: string } | { ok: false; error: DiagramError }

/**
 * Theme of `theme` from the design tokens (`mermaidTheme.ts`), labels as SVG text, strict
 * security. Built when a diagram is drawn for that theme, so the tokens are read from the loaded
 * stylesheet.
 */
function buildConfig(theme: ResolvedTheme): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    // Labels as SVG text, never HTML in a foreignObject.
    htmlLabels: false,
    suppressErrorRendering: true,
    maxTextSize: DIAGRAM_LIMITS.maxChars,
    maxEdges: DIAGRAM_LIMITS.maxEdges,
    theme: 'base',
    darkMode: theme === 'dark',
    fontFamily: diagramFontFamily(theme),
    themeVariables: mermaidThemeVariables(theme),
    // Keys a diagram can never override (directives are also refused before rendering).
    secure: [
      'secure',
      'securityLevel',
      'startOnLoad',
      'maxTextSize',
      'maxEdges',
      'suppressErrorRendering',
      'htmlLabels',
      'theme',
      'themeVariables',
      'themeCSS',
      'fontFamily'
    ]
  }
}

/**
 * Mermaid measures labels with the font in use: wait for the UI font (self-hosted, loaded on
 * first use) so the boxes are sized for the final glyphs and the text does not clip.
 */
async function waitForFont(theme: ResolvedTheme): Promise<void> {
  try {
    await document.fonts.load(`14px ${diagramFontFamily(theme)}`)
  } catch {
    // Fallback font: labels are measured with it, still legible.
  }
}

let loading: Promise<Mermaid> | null = null
/** Theme mermaid was last initialized for. */
let configured: ResolvedTheme | null = null

/** Imports mermaid once; a failed import is retried by the next call. */
function importMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(
    ({ default: mermaid }) => mermaid,
    (reason: unknown) => {
      loading = null
      throw reason
    }
  )
  return loading
}

/**
 * Mermaid configured for `theme`: initialized again when the theme differs from the last one
 * drawn. Renders run one at a time (see `renderDiagram`), so no render sees the other config.
 */
async function loadMermaid(theme: ResolvedTheme): Promise<Mermaid> {
  const [mermaid] = await Promise.all([importMermaid(), waitForFont(theme)])
  if (configured !== theme) {
    mermaid.initialize(buildConfig(theme))
    configured = theme
  }
  return mermaid
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No result after ${ms / 1000} s.`)), ms)
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (reason: unknown) => (clearTimeout(timer), reject(reason))
    )
  })
}

/** Lets the browser paint between two renders. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Removes what mermaid may leave in the body after a failed render. */
function cleanUp(renderId: string) {
  document.getElementById(renderId)?.remove()
  document.getElementById(`d${renderId}`)?.remove()
}

async function renderNow(
  source: string,
  renderId: string,
  theme: ResolvedTheme
): Promise<RenderResult> {
  const mermaid = await loadMermaid(theme)
  try {
    await mermaid.parse(source)
  } catch (reason) {
    return { ok: false, error: diagramErrorFromException('parse_error', reason) }
  }
  try {
    const { svg } = await mermaid.render(renderId, source)
    return { ok: true, svg }
  } catch (reason) {
    cleanUp(renderId)
    return { ok: false, error: diagramErrorFromException('render_error', reason) }
  }
}

const cache = new Map<string, Promise<RenderResult>>()
const settled = new Map<string, RenderResult>()
let queue: Promise<unknown> = Promise.resolve()

/** Render id of a source key, the id mermaid gives the SVG. */
export const renderIdOf = (key: string) => `mermaid-${key}`

/** Cache key of a source in a theme: a diagram is drawn once per theme it is shown in. */
const cacheKey = (key: string, theme: ResolvedTheme) => `${theme}:${key}`

/**
 * Renders a checked source (see `planDiagram`) to an SVG string in the colors of `theme`. One
 * render at a time, each after a yield to the event loop and bounded by `RENDER_TIMEOUT_MS`;
 * results are cached by key and theme for the session. Never rejects.
 */
export function renderDiagram(
  source: string,
  key: string,
  theme: ResolvedTheme
): Promise<RenderResult> {
  const id = cacheKey(key, theme)
  const cached = cache.get(id)
  if (cached) return cached
  const task = queue
    .then(nextTask)
    .then(() => withTimeout(renderNow(source, renderIdOf(key), theme), RENDER_TIMEOUT_MS))
    .catch((reason: unknown): RenderResult => ({
      ok: false,
      error: diagramErrorFromException(
        reason instanceof Error && reason.message.startsWith('No result after')
          ? 'timeout'
          : 'render_error',
        reason
      )
    }))
    .then((result) => {
      settled.set(id, result)
      return result
    })
  cache.set(id, task)
  queue = task
  return task
}

/** Result already available for a key in a theme, so a remounted diagram shows at once (no flicker). */
export const peekRenderedDiagram = (key: string, theme: ResolvedTheme): RenderResult | undefined =>
  settled.get(cacheKey(key, theme))
