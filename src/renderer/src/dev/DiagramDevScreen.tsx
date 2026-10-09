import { useCallback, useEffect, useState } from 'react'
import '../lesson/lesson.css'
import type { DiagramErrorEvent } from '../markdown/diagramSource'
import { MarkdownContent } from '../markdown/MarkdownContent'
import { DIAGRAM_FIXTURES, STREAMING_FIXTURE } from './diagramFixtures'

const fence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``

/**
 * Dev-only screen showing the diagram fixtures through the shared Markdown renderer, a simulated
 * stream of a lesson with a diagram, and the `onDiagramError` events. No Claude call.
 */
export function DiagramDevScreen({ onClose }: { onClose: () => void }) {
  const [errors, setErrors] = useState<DiagramErrorEvent[]>([])
  const [length, setLength] = useState(STREAMING_FIXTURE.length)
  const [playing, setPlaying] = useState(false)
  const [streaming, setStreaming] = useState(false)

  const onDiagramError = useCallback(
    (event: DiagramErrorEvent) => setErrors((previous) => [...previous, event]),
    []
  )

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setLength((current) => {
        const next = Math.min(current + 6, STREAMING_FIXTURE.length)
        if (next === STREAMING_FIXTURE.length) {
          setPlaying(false)
          setStreaming(false)
        }
        return next
      })
    }, 80)
    return () => clearInterval(timer)
  }, [playing])

  const play = () => {
    setLength(0)
    setStreaming(true)
    setPlaying(true)
  }

  return (
    <main className="lesson-view" data-testid="diagram-dev">
      <nav className="lesson-nav">
        <button type="button" onClick={onClose}>
          Back
        </button>
        <h1>Diagrams (dev)</h1>
      </nav>
      <div className="lesson-scroll">
        <section className="lesson-body" data-testid="diagram-dev-stream">
          <h2>Streaming</h2>
          <p>
            <button type="button" data-testid="diagram-dev-play" onClick={play}>
              Play the stream
            </button>{' '}
            <label>
              <input
                type="checkbox"
                checked={streaming}
                data-testid="diagram-dev-streaming"
                onChange={(event) => setStreaming(event.target.checked)}
              />{' '}
              streaming
            </label>{' '}
            <label>
              Characters{' '}
              <input
                type="range"
                min={0}
                max={STREAMING_FIXTURE.length}
                value={length}
                data-testid="diagram-dev-length"
                onChange={(event) => setLength(Number(event.target.value))}
              />{' '}
              {length}/{STREAMING_FIXTURE.length}
            </label>
          </p>
          <MarkdownContent
            markdown={STREAMING_FIXTURE.slice(0, length)}
            streaming={streaming}
            onDiagramError={onDiagramError}
          />
        </section>
        {DIAGRAM_FIXTURES.map((fixture) => (
          <section
            key={fixture.id}
            className="lesson-body"
            data-testid={`diagram-fixture-${fixture.id}`}
          >
            <h2>{fixture.label}</h2>
            <MarkdownContent markdown={fence(fixture.source)} onDiagramError={onDiagramError} />
          </section>
        ))}
        <section className="lesson-body" data-testid="diagram-dev-errors">
          <h2>onDiagramError events ({errors.length})</h2>
          <ul>
            {errors.map((event, index) => (
              <li key={index}>
                <code>{event.error.code}</code>: {event.error.message}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
