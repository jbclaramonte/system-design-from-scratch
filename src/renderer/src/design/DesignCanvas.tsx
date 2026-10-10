import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useEffect, useState } from 'react'
import { createShapeId, getSnapshot, Tldraw, type Editor, type TLEditorSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'
import { iconUrlsByName } from './assetUrls'
import { componentShapeUtils } from './componentShapes'
import { COMPONENT_LOOKS, COMPONENT_TYPES, type ComponentType } from './componentTypes'
import { createDebouncedSave } from './debouncedSave'
import { deserializeScene, serializeScene } from './sceneSnapshot'

/**
 * One URL per UI icon instead of tldraw's `0_merged.svg#name` sprite: the built renderer inlines
 * assets as data: URLs (see electron.vite.config.ts), and a fragment on a data: URL is not resolved.
 */
const iconUrls = import.meta.glob<string>(
  ['../../../../node_modules/@tldraw/assets/icons/icon/*.svg', '!**/0_merged.svg'],
  { query: '?url', import: 'default', eager: true }
)
const bundledAssetUrls = getAssetUrlsByImport()

/** Fonts, icons and translations bundled by Vite: the editor never fetches them from a CDN. */
const assetUrls = {
  ...bundledAssetUrls,
  icons: { ...bundledAssetUrls.icons, ...iconUrlsByName(iconUrls) }
}

/** Empty in dev is fine (tldraw shows a dev watermark); a packaged build needs a valid key. */
const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY || undefined

const AUTOSAVE_DELAY_MS = 500

function addComponent(editor: Editor, type: ComponentType) {
  const { defaultW, defaultH } = COMPONENT_LOOKS[type]
  const center = editor.getViewportPageBounds().center
  const id = createShapeId()
  editor.createShape({ id, type, x: center.x - defaultW / 2, y: center.y - defaultH / 2 })
  editor.select(id)
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: TLEditorSnapshot | undefined }
  | { status: 'error'; message: string }

/**
 * Design Canvas of one Design Exercise: tldraw with the typed component shapes and a palette.
 * The Design Scene is loaded once, then autosaved (debounced) on every document change. Mount it
 * with `key={designExerciseId}` to switch exercises. `onEditorChange` hands out the live editor
 * (for the Design Export), and `null` when it unmounts.
 */
export function DesignCanvas({
  designExerciseId,
  onEditorChange
}: {
  designExerciseId: number
  onEditorChange?: (editor: Editor | null) => void
}) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    window.api
      .loadDesignScene({ designExerciseId })
      .then((stored) => {
        if (active) setLoad({ status: 'ready', snapshot: deserializeScene(stored) })
      })
      .catch((reason: unknown) => {
        if (active) setLoad({ status: 'error', message: String(reason) })
      })
    return () => {
      active = false
    }
  }, [designExerciseId])

  const onMount = (mounted: Editor) => {
    setEditor(mounted)
    onEditorChange?.(mounted)
    const autosave = createDebouncedSave({
      delayMs: AUTOSAVE_DELAY_MS,
      capture: () => serializeScene(getSnapshot(mounted.store)),
      save: async (snapshot) => {
        await window.api.saveDesignScene({ designExerciseId, snapshot })
        setSaveError(null)
      },
      onError: (reason) => setSaveError(String(reason))
    })
    const unlisten = mounted.store.listen(() => autosave.markDirty(), {
      scope: 'document',
      source: 'user'
    })
    // Best effort when the window closes before the debounce fires.
    const onPageHide = () => void autosave.flush()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      unlisten()
      void autosave.flush()
      setEditor(null)
      onEditorChange?.(null)
    }
  }

  if (load.status === 'loading') return <p>Loading the design scene...</p>
  if (load.status === 'error')
    return <p role="alert">Could not load the design scene: {load.message}</p>

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div
        data-testid="design-palette"
        style={{
          width: 160,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderRight: '1px solid var(--color-border-hairline)'
        }}
      >
        <strong>Components</strong>
        {COMPONENT_TYPES.map((type) => (
          <button
            key={type}
            data-testid={`add-${type}`}
            disabled={!editor}
            onClick={() => editor && addComponent(editor, type)}
          >
            + {COMPONENT_LOOKS[type].label}
          </button>
        ))}
        <button
          data-testid="tool-arrow"
          disabled={!editor}
          onClick={() => editor?.setCurrentTool('arrow')}
        >
          Arrow
        </button>
        {saveError && <p role="alert">Autosave failed: {saveError}</p>}
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          licenseKey={licenseKey}
          assetUrls={assetUrls}
          shapeUtils={componentShapeUtils}
          snapshot={load.snapshot}
          onMount={onMount}
        />
      </div>
    </div>
  )
}
