import { useEffect, useRef, useState } from 'react'
import type { GenerationEvent, GenerationKind } from '../../../shared/generation'
import { SettingsErrorAction } from '../settings/SettingsErrorAction'

/**
 * Dev-only check of the Generation round trip (start, streamed events, cancel) over IPC. Uses the
 * placeholder prompts; every uncached start is a real Claude Code CLI call. Not a product screen.
 */
export function GenerationDevPanel() {
  const [kind, setKind] = useState<GenerationKind>('lesson')
  const [requestId, setRequestId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [last, setLast] = useState<GenerationEvent | null>(null)
  const current = useRef<string | null>(null)

  useEffect(
    () =>
      window.api.onGenerationEvent(({ requestId: id, event }) => {
        if (id !== current.current) return
        if (event.type === 'text_delta') setText((previous) => previous + event.text)
        else if (event.type === 'retry') setText('')
        setLog((previous) => [...previous, event.type])
        if (event.type === 'done' || event.type === 'error') {
          setLast(event)
          setRequestId(null)
        }
      }),
    []
  )

  const start = () => {
    const id = crypto.randomUUID()
    current.current = id
    setRequestId(id)
    setText('')
    setLog([])
    setLast(null)
    window.api
      .startGeneration({
        requestId: id,
        kind,
        input: { topic: 'dev-check', sectionIds: ['cache/when-to-update-the-cache'] }
      })
      .catch((reason: unknown) => setLog((previous) => [...previous, `start failed: ${reason}`]))
  }

  return (
    <section data-testid="generation-dev-panel">
      <h2>Generation (dev only)</h2>
      <select value={kind} onChange={(e) => setKind(e.target.value as GenerationKind)}>
        <option value="lesson">lesson</option>
        <option value="quiz">quiz</option>
      </select>
      <button type="button" onClick={start} disabled={requestId !== null}>
        Start
      </button>
      <button
        type="button"
        onClick={() => requestId && void window.api.cancelGeneration({ requestId })}
        disabled={requestId === null}
      >
        Cancel
      </button>
      <p data-testid="generation-log">{log.join(' ')}</p>
      <pre data-testid="generation-text">{text}</pre>
      <pre data-testid="generation-last">{last && JSON.stringify(last, null, 2)}</pre>
      {last?.type === 'error' && <SettingsErrorAction code={last.error.code} />}
    </section>
  )
}
