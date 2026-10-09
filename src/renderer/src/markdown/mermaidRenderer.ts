import type { Mermaid, MermaidConfig } from 'mermaid'
import { DIAGRAM_LIMITS, diagramErrorFromException, type DiagramError } from './diagramSource'

// Lazy, single mermaid instance for the renderer. `mermaid` (and the chunk of each diagram type)
// is only fetched by the first diagram on screen, so the main bundle does not grow.

/** A render that has not settled after this is reported as `timeout` (see docs/Mermaid Diagrams.md). */
export const RENDER_TIMEOUT_MS = 10_000

export type RenderResult = { ok: true; svg: string } | { ok: false; error: DiagramError }

const FONT_FAMILY = 'system-ui, sans-serif'

/** Plain styles matching the app: dark text on the source-chip blue, grey lines, system font. */
const CONFIG: MermaidConfig = {
  startOnLoad: false,
  securityLevel: 'strict',
  // Labels as SVG text, never HTML in a foreignObject.
  htmlLabels: false,
  suppressErrorRendering: true,
  maxTextSize: DIAGRAM_LIMITS.maxChars,
  maxEdges: DIAGRAM_LIMITS.maxEdges,
  theme: 'base',
  fontFamily: FONT_FAMILY,
  themeVariables: {
    fontFamily: FONT_FAMILY,
    fontSize: '14px',
    background: '#ffffff',
    primaryColor: '#f0f4fc',
    primaryBorderColor: '#2b4a8b',
    primaryTextColor: '#1a1a1a',
    secondaryColor: '#f5f5f5',
    tertiaryColor: '#ffffff',
    lineColor: '#555555',
    textColor: '#1a1a1a',
    noteBkgColor: '#fff4e5',
    noteBorderColor: '#c77d1a',
    noteTextColor: '#1a1a1a'
  },
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

let loading: Promise<Mermaid> | null = null

/** Imports and initializes mermaid once; a failed import is retried by the next call. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then(
    ({ default: mermaid }) => {
      mermaid.initialize(CONFIG)
      return mermaid
    },
    (reason: unknown) => {
      loading = null
      throw reason
    }
  )
  return loading
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

async function renderNow(source: string, renderId: string): Promise<RenderResult> {
  const mermaid = await loadMermaid()
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

/**
 * Renders a checked source (see `planDiagram`) to an SVG string. One render at a time, each
 * after a yield to the event loop and bounded by `RENDER_TIMEOUT_MS`; results are cached by
 * key for the session. Never rejects.
 */
export function renderDiagram(source: string, key: string): Promise<RenderResult> {
  const cached = cache.get(key)
  if (cached) return cached
  const task = queue
    .then(nextTask)
    .then(() => withTimeout(renderNow(source, renderIdOf(key)), RENDER_TIMEOUT_MS))
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
      settled.set(key, result)
      return result
    })
  cache.set(key, task)
  queue = task
  return task
}

/** Result already available for a key, so a remounted diagram shows at once (no flicker). */
export const peekRenderedDiagram = (key: string): RenderResult | undefined => settled.get(key)
