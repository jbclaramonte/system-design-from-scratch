import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { DesignExport, DesignExportSummary } from '../../../shared/designGraph'
import { exportDesign } from '../design/export'

/**
 * Dev-only panel next to the Design Canvas: exports the scene (Design Graph JSON, text
 * description, PNG), hands it to the main process over `design:exportScene` and shows the result.
 */
export function DesignExportDevPanel({
  editor,
  designExerciseId
}: {
  editor: Editor | null
  designExerciseId: number
}) {
  const [result, setResult] = useState<DesignExport | null>(null)
  const [summary, setSummary] = useState<DesignExportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!editor) return
    setBusy(true)
    setError(null)
    try {
      const exported = await exportDesign(editor, designExerciseId)
      setResult(exported)
      setSummary(await window.api.exportDesignScene(exported))
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }

  const pre = { whiteSpace: 'pre-wrap', fontSize: 11, margin: 0 } as const

  return (
    <aside
      data-testid="design-export-dev"
      style={{
        width: 380,
        padding: 12,
        overflow: 'auto',
        borderLeft: '1px solid var(--color-border-hairline)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <strong>Design Export</strong>
      <button data-testid="design-export-run" disabled={!editor || busy} onClick={run}>
        {busy ? 'Exporting...' : 'Export'}
      </button>
      {error && <p role="alert">{error}</p>}
      {summary && (
        <p data-testid="design-export-summary" style={{ margin: 0 }}>
          Main received: {summary.nodes} nodes, {summary.edges} edges, {summary.annotations}{' '}
          annotations, {summary.danglingArrows} dangling arrows, {summary.groups} groups, PNG{' '}
          {summary.pngBytes} bytes
        </p>
      )}
      {result && (
        <>
          <strong>Description</strong>
          <pre data-testid="design-export-description" style={pre}>
            {result.description}
          </pre>
          <strong>PNG</strong>
          {result.png ? (
            <img
              data-testid="design-export-png"
              alt="Design Scene capture"
              src={`data:image/png;base64,${result.png.base64}`}
              style={{ width: '100%', border: '1px solid var(--color-border-hairline)' }}
              title={`${result.png.width} x ${result.png.height}`}
            />
          ) : (
            <p style={{ margin: 0 }}>No PNG: the scene is empty.</p>
          )}
          <strong>Design Graph</strong>
          <pre data-testid="design-export-json" style={pre}>
            {JSON.stringify(result.graph, null, 2)}
          </pre>
        </>
      )}
    </aside>
  )
}
