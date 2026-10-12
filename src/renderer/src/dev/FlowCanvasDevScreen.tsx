import { useEffect, useRef, useState } from 'react'
import type { DesignGraph, DesignPng } from '../../../shared/designGraph'
import { createDebouncedSave, type DebouncedSave } from '../design/debouncedSave'
import { describeDesignGraph } from '../design/export/describeDesignGraph'
import { FlowCanvas, type FlowCanvasHandle } from '../design/flow/FlowCanvas'
import {
  deserializeScene,
  EMPTY_SCENE,
  parseSceneText,
  serializeScene,
  type Scene
} from '../design/flow/scene'

/**
 * Dev-only screen of the React Flow spike (#42): the Design Canvas on React Flow, with its scene
 * kept in localStorage (stand-in for `design_scenes.snapshot`, same JSON), the Design Graph and
 * PNG exports, and a field to put any value in the storage to check the invalid-scene error.
 * Not a product screen.
 */

const STORAGE_KEY = 'flow-spike-scene'
const AUTOSAVE_DELAY_MS = 500

type Stored =
  | { status: 'ready'; scene: Scene; revision: number }
  | { status: 'error'; message: string; revision: number }

function readStorage(revision: number): Stored {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch (reason) {
    return { status: 'error', message: `Storage unavailable: ${String(reason)}`, revision }
  }
  try {
    // No stored value yet is a new scene; a stored value that is not a scene is an error.
    const scene = raw === null ? deserializeScene(null) : parseSceneText(raw)
    return { status: 'ready', scene: scene ?? EMPTY_SCENE, revision }
  } catch (reason) {
    return { status: 'error', message: String(reason), revision }
  }
}

export function FlowCanvasDevScreen({ onClose }: { onClose: () => void }) {
  const [stored, setStored] = useState<Stored>(() => readStorage(0))
  const [field, setField] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [graph, setGraph] = useState<DesignGraph | null>(null)
  const [png, setPng] = useState<DesignPng | null>(null)
  const [busy, setBusy] = useState(false)
  const handle = useRef<FlowCanvasHandle>(null)
  const autosave = useRef<DebouncedSave | null>(null)

  // Autosave, the way the tldraw canvas does it: debounced, capture at fire time.
  useEffect(() => {
    const save = createDebouncedSave<Scene>({
      delayMs: AUTOSAVE_DELAY_MS,
      capture: () => {
        if (!handle.current) throw new Error('The canvas is not mounted')
        return handle.current.getScene()
      },
      save: async (scene) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeScene(scene)))
        setSavedAt(new Date().toLocaleTimeString())
        setSaveError(null)
      },
      onError: (reason) => setSaveError(String(reason))
    })
    autosave.current = save
    return () => {
      void save.flush()
      autosave.current = null
    }
  }, [stored.revision])

  const reload = () => {
    autosave.current?.cancel()
    setGraph(null)
    setPng(null)
    setStored((current) => readStorage(current.revision + 1))
  }

  const storeField = () => {
    autosave.current?.cancel()
    localStorage.setItem(STORAGE_KEY, field)
    reload()
  }

  const clearStorage = () => {
    autosave.current?.cancel()
    localStorage.removeItem(STORAGE_KEY)
    setField('')
    reload()
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setExportError(null)
    try {
      await task()
    } catch (reason) {
      setExportError(String(reason))
    } finally {
      setBusy(false)
    }
  }

  const exportGraph = () =>
    run(async () => {
      if (handle.current) setGraph(handle.current.exportGraph())
    })
  const exportPng = () =>
    run(async () => {
      if (handle.current) setPng(await handle.current.exportPng())
    })

  const pre = { whiteSpace: 'pre-wrap', fontSize: 11, margin: 0 } as const

  return (
    <section
      data-testid="flow-canvas-dev"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 12px' }}>
        <button onClick={onClose}>Back</button>
        <strong>Flow canvas (dev, React Flow spike #42)</strong>
        <span data-testid="flow-save-status">
          {saveError
            ? `Autosave failed: ${saveError}`
            : savedAt
              ? `Saved ${savedAt}`
              : 'Not saved yet'}
        </span>
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderTop: '1px solid var(--color-border-hairline)',
          display: 'flex'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {stored.status === 'error' ? (
            <p role="alert" data-testid="flow-load-error" className="notice notice-error">
              Could not open the design scene: {stored.message}
            </p>
          ) : (
            <FlowCanvas
              key={stored.revision}
              initialScene={stored.scene}
              handle={handle}
              onDirty={() => autosave.current?.markDirty()}
            />
          )}
        </div>
        <aside
          data-testid="flow-dev-panel"
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
          <strong>Stored scene (localStorage)</strong>
          <textarea
            data-testid="flow-storage-field"
            aria-label="Stored scene JSON"
            rows={4}
            value={field}
            onChange={(event) => setField(event.target.value)}
          />
          <div className="chip-row">
            <button className="btn-sm" data-testid="flow-storage-store" onClick={storeField}>
              Store and reload
            </button>
            <button className="btn-sm" data-testid="flow-storage-reload" onClick={reload}>
              Reload from storage
            </button>
            <button className="btn-sm" data-testid="flow-storage-clear" onClick={clearStorage}>
              Discard stored scene
            </button>
          </div>
          <strong>Export</strong>
          <div className="chip-row">
            <button
              className="btn-sm"
              data-testid="flow-export-graph"
              disabled={busy || stored.status !== 'ready'}
              onClick={exportGraph}
            >
              Design Graph
            </button>
            <button
              className="btn-sm"
              data-testid="flow-export-png"
              disabled={busy || stored.status !== 'ready'}
              onClick={exportPng}
            >
              PNG
            </button>
          </div>
          {exportError && (
            <p role="alert" data-testid="flow-export-error">
              {exportError}
            </p>
          )}
          {png && (
            <>
              <strong data-testid="flow-png-size">
                PNG {png.width} x {png.height}
              </strong>
              <img
                data-testid="flow-export-png-image"
                alt="Design Scene capture"
                src={`data:image/png;base64,${png.base64}`}
                style={{ width: '100%', border: '1px solid var(--color-border-hairline)' }}
              />
            </>
          )}
          {graph && (
            <>
              <strong>Description</strong>
              <pre data-testid="flow-export-description" style={pre}>
                {describeDesignGraph(graph)}
              </pre>
              <strong>Design Graph</strong>
              <pre data-testid="flow-export-json" style={pre}>
                {JSON.stringify(graph, null, 2)}
              </pre>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
