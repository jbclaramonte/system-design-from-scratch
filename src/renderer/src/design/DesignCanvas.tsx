import { useCallback, useEffect, useRef, useState } from 'react'
import { createDebouncedSave, type DebouncedSave } from './debouncedSave'
import { EMPTY_SCENE, serializeScene, type Scene } from './flow/scene'
import { FlowCanvas, type FlowCanvasHandle } from './flow/FlowCanvas'
import { readStoredScene } from './storedScene'
import type { Json } from '../../../shared/json'

const AUTOSAVE_DELAY_MS = 500

/** What the Design Export and the screens can ask of the canvas: the scene as it is now. */
export type DesignCanvasHandle = FlowCanvasHandle

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** A scene tldraw stored that cannot be converted: the learner may start over. */
  | { status: 'legacy'; reason: string; confirming: boolean; failure: string | null }
  | {
      status: 'ready'
      scene: Scene
      /** Opened from a converted tldraw scene (not stored in the new format yet). */
      converted: { warnings: string[] } | null
      revision: number
    }

/**
 * Design Canvas of one Design Exercise, on React Flow. It loads the stored Design Scene before it
 * mounts the canvas, then autosaves it (debounced) after every change the learner makes. Mount it
 * with `key={designExerciseId}` to switch exercises.
 *
 * - A scene stored by the previous (tldraw) canvas is converted in memory and only replaced in the
 *   database by the first autosave, after an edit. One that cannot be converted shows a message
 *   and a "Start over" button (two clicks): the stored value is only replaced by that action.
 * - A stored value that is not a Design Scene shows an error and no canvas, so the autosave can
 *   never overwrite it.
 * - `onHandleChange` hands out the live canvas (for the Design Export), and `null` when it goes.
 */
export function DesignCanvas({
  designExerciseId,
  onHandleChange
}: {
  designExerciseId: number
  onHandleChange?: (handle: DesignCanvasHandle | null) => void
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const autosave = useRef<DebouncedSave | null>(null)
  /** The last canvas that mounted: still readable while the canvas unmounts (final flush). */
  const lastHandle = useRef<DesignCanvasHandle | null>(null)
  const notify = useRef(onHandleChange)
  useEffect(() => {
    notify.current = onHandleChange
  })

  useEffect(() => {
    let active = true
    window.api
      .loadDesignScene({ designExerciseId })
      .then((stored) => {
        if (!active) return
        const read = readStoredScene(stored)
        switch (read.status) {
          case 'empty':
            setLoad({ status: 'ready', scene: EMPTY_SCENE, converted: null, revision: 0 })
            break
          case 'scene':
            setLoad({ status: 'ready', scene: read.scene, converted: null, revision: 0 })
            break
          case 'converted':
            setLoad({
              status: 'ready',
              scene: read.scene,
              converted: { warnings: read.warnings },
              revision: 0
            })
            break
          case 'legacy':
            setLoad({ status: 'legacy', reason: read.reason, confirming: false, failure: null })
            break
        }
      })
      .catch((reason: unknown) => {
        if (active) setLoad({ status: 'error', message: String(reason) })
      })
    return () => {
      active = false
    }
  }, [designExerciseId])

  useEffect(() => {
    const save = createDebouncedSave<Json>({
      delayMs: AUTOSAVE_DELAY_MS,
      capture: () => {
        if (!lastHandle.current) throw new Error('The Design Canvas is not mounted')
        return serializeScene(lastHandle.current.getScene())
      },
      save: async (snapshot) => {
        await window.api.saveDesignScene({ designExerciseId, snapshot })
        setSaveError(null)
      },
      onError: (reason) => setSaveError(String(reason))
    })
    autosave.current = save
    // Best effort when the window closes before the debounce fires.
    const onPageHide = () => void save.flush()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      void save.flush()
      autosave.current = null
    }
  }, [designExerciseId])

  const handle = useCallback((mounted: FlowCanvasHandle | null) => {
    if (mounted) lastHandle.current = mounted
    notify.current?.(mounted)
  }, [])
  const markDirty = useCallback(() => autosave.current?.markDirty(), [])

  const startOver = () => {
    setLoad((current) => (current.status === 'legacy' ? { ...current, failure: null } : current))
    window.api
      .saveDesignScene({ designExerciseId, snapshot: serializeScene(EMPTY_SCENE) })
      .then(() => setLoad({ status: 'ready', scene: EMPTY_SCENE, converted: null, revision: 1 }))
      .catch((reason: unknown) =>
        setLoad((current) =>
          current.status === 'legacy'
            ? { ...current, confirming: false, failure: String(reason) }
            : current
        )
      )
  }

  if (load.status === 'loading')
    return <p className="design-canvas-status">Loading the design scene...</p>
  if (load.status === 'error')
    return (
      <p role="alert" className="design-canvas-status">
        Could not load the design scene: {load.message}
      </p>
    )
  if (load.status === 'legacy') {
    return (
      <div className="design-canvas-status" data-testid="legacy-scene">
        <p role="alert">
          This design was drawn with the previous canvas and could not be converted: {load.reason}.
          Your design is untouched in the database until you start over.
        </p>
        {load.failure && <p role="alert">Could not start over: {load.failure}</p>}
        {load.confirming ? (
          <p className="chip-row">
            <button
              type="button"
              className="btn-sm"
              data-testid="legacy-start-over-confirm"
              onClick={startOver}
            >
              Discard the old design and start over
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setLoad({ ...load, confirming: false })}
            >
              Cancel
            </button>
          </p>
        ) : (
          <button
            type="button"
            className="btn-sm"
            data-testid="legacy-start-over"
            onClick={() => setLoad({ ...load, confirming: true })}
          >
            Start over with an empty canvas
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="design-canvas-host">
      {load.converted && (
        <div
          role="status"
          className="notice notice-attention design-canvas-notice"
          data-testid="legacy-converted"
        >
          <p>
            This design was drawn with the previous canvas and has been converted. The converted
            version is saved after your next change.
          </p>
          {load.converted.warnings.length > 0 && (
            <ul>
              {load.converted.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="design-canvas-body">
        <FlowCanvas
          key={load.revision}
          initialScene={load.scene}
          onDirty={markDirty}
          handle={handle}
          paletteNotice={
            saveError && (
              <p role="alert" className="design-palette-error">
                Autosave failed: {saveError}
              </p>
            )
          }
        />
      </div>
    </div>
  )
}
