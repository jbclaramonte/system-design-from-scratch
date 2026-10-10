import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'
import type { DesignExerciseRef } from '../../../shared/ipc'
import { DesignCanvas } from '../design/DesignCanvas'
import { DesignExportDevPanel } from './DesignExportDevPanel'

/**
 * Dev-only screen: opens the Design Canvas on a scratch Design Exercise so Design Scene
 * persistence can be checked end to end. Not a product screen (the exercise flow is #13-#15).
 */
export function DesignCanvasDevScreen({ onClose }: { onClose: () => void }) {
  const [exercise, setExercise] = useState<DesignExerciseRef | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  useEffect(() => {
    window.api
      .openScratchDesignExercise()
      .then(setExercise)
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  return (
    <section
      data-testid="design-canvas-dev"
      style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '6px 12px' }}>
        <button onClick={onClose}>Back</button>
        <strong>Design canvas (dev)</strong>
        {exercise && (
          <span>
            Exercise #{exercise.id} {exercise.title}
          </span>
        )}
      </header>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderTop: '1px solid var(--color-border-hairline)',
          display: 'flex'
        }}
      >
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          exercise && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <DesignCanvas
                  key={exercise.id}
                  designExerciseId={exercise.id}
                  onEditorChange={setEditor}
                />
              </div>
              <DesignExportDevPanel editor={editor} designExerciseId={exercise.id} />
            </>
          )
        )}
      </div>
    </section>
  )
}
