import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import {
  cssSafeId,
  diagramLabel,
  planDiagram,
  svgMinWidth,
  warnDiagramOnce,
  withSvgId,
  type DiagramError,
  type DiagramErrorEvent,
  type DiagramType
} from './diagramSource'
import {
  peekRenderedDiagram,
  renderDiagram,
  renderIdOf,
  type RenderResult
} from './mermaidRenderer'
import './markdown.css'

export interface MermaidDiagramProps {
  /** Mermaid source, without the fences. */
  source: string
  /** Accessible title; defaults to the source's `accTitle:` or front matter `title:`. */
  title?: string
  /** Visible caption under the diagram. */
  caption?: string
  /** Called once per failure (checks, parse, render, timeout); the fallback is shown anyway. */
  onDiagramError?: (event: DiagramErrorEvent) => void
}

/** Subtle placeholder of a diagram being streamed or drawn. */
export function DiagramLoading() {
  return (
    <div className="diagram-loading" role="status" data-testid="diagram-loading">
      Diagram loading…
    </div>
  )
}

function SourceDetails({ source }: { source: string }) {
  return (
    <details className="diagram-source" data-testid="diagram-source">
      <summary>Diagram source</summary>
      <pre>
        <code className="language-mermaid">{source}</code>
      </pre>
    </details>
  )
}

function DiagramFallback({ source, error }: { source: string; error: DiagramError }) {
  return (
    <div className="diagram-fallback" data-testid="diagram-fallback" data-code={error.code}>
      <p className="diagram-fallback-note" role="note">
        This diagram could not be drawn.{' '}
        <span className="diagram-fallback-reason">{error.message}</span>
      </p>
      <pre>
        <code className="language-mermaid">{source}</code>
      </pre>
    </div>
  )
}

function DrawnDiagram({
  source,
  diagramKey,
  type,
  label,
  onError
}: {
  source: string
  diagramKey: string
  type: DiagramType
  label: string
  onError: (error: DiagramError) => void
}) {
  const instanceId = `diagram-${cssSafeId(useId())}-${diagramKey}`
  const [result, setResult] = useState<RenderResult | undefined>(() =>
    peekRenderedDiagram(diagramKey)
  )

  useEffect(() => {
    if (result) return
    let active = true
    void renderDiagram(source, diagramKey).then((rendered) => {
      if (active) setResult(rendered)
    })
    return () => {
      active = false
    }
  }, [result, source, diagramKey])

  useEffect(() => {
    if (result && !result.ok) onError(result.error)
  }, [result, onError])

  const svg = useMemo(
    () => (result?.ok ? withSvgId(result.svg, renderIdOf(diagramKey), instanceId) : null),
    [result, diagramKey, instanceId]
  )

  if (!result) return <DiagramLoading />
  if (!result.ok) return <DiagramFallback source={source} error={result.error} />
  const minWidth = svgMinWidth(svg!)
  return (
    <>
      <div
        className="diagram-scroll"
        role="img"
        aria-label={label}
        tabIndex={0}
        data-testid="diagram-svg"
        data-type={type}
        style={minWidth ? ({ '--diagram-min-width': `${minWidth}px` } as CSSProperties) : undefined}
        // Sanitized by mermaid (securityLevel strict, DOMPurify); the CSP blocks inline scripts.
        dangerouslySetInnerHTML={{ __html: svg! }}
      />
      <SourceDetails source={source} />
    </>
  )
}

/**
 * Draws one Mermaid Diagram, or falls back to its source as a code block with a short note.
 * Memoized: re-rendering with the same props does nothing, and a source drawn before (same
 * `diagramKey`) shows at once from the session cache. Pass a stable `onDiagramError`.
 */
export const MermaidDiagram = memo(function MermaidDiagram({
  source,
  title,
  caption,
  onDiagramError
}: MermaidDiagramProps) {
  const plan = useMemo(() => planDiagram(source), [source])
  const callback = useRef(onDiagramError)
  useLayoutEffect(() => {
    callback.current = onDiagramError
  })

  const reportedSource = plan.kind === 'loading' ? source : plan.source
  const onError = useMemo(
    () => (error: DiagramError) => {
      if (plan.kind !== 'loading') warnDiagramOnce(plan.key, error)
      callback.current?.({ source: reportedSource, error })
    },
    [plan, reportedSource]
  )

  useEffect(() => {
    if (plan.kind === 'fallback') onError(plan.error)
  }, [plan, onError])

  return (
    <figure
      className="diagram"
      data-testid="diagram"
      data-kind={plan.kind}
      data-key={plan.kind === 'loading' ? undefined : plan.key}
    >
      {plan.kind === 'render' ? (
        <DrawnDiagram
          key={plan.key}
          source={plan.source}
          diagramKey={plan.key}
          type={plan.type}
          label={diagramLabel(plan.type, title ?? plan.title)}
          onError={onError}
        />
      ) : plan.kind === 'fallback' ? (
        <DiagramFallback source={plan.source} error={plan.error} />
      ) : (
        <DiagramLoading />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
})
