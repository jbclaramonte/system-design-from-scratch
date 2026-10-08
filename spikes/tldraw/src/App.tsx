import { useEffect, useState } from 'react'
import { Tldraw, createShapeId, type Editor, type TLBindingCreate, type TLShapePartial } from 'tldraw'
import 'tldraw/tldraw.css'
import { buildGraph, type SceneBinding, type SceneGraph, type SceneShape } from './graph/exportGraph'
import { fixtureBindings, fixtureShapes } from './fixtures/scene'
import { COMPONENT_KINDS, DEFAULT_W, LOOKS, componentShapeUtils, type ComponentKind } from './shapes/componentShapes'

const shapeUtils = componentShapeUtils

/** Read the current page of the editor as a SceneGraph. */
function exportGraph(editor: Editor): SceneGraph {
  const shapes = editor.getCurrentPageShapes() as unknown as SceneShape[]
  const bindings = editor.store.allRecords().filter((r) => r.typeName === 'binding') as unknown as SceneBinding[]
  return buildGraph(shapes, bindings)
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

async function exportPng(editor: Editor) {
  const ids = [...editor.getCurrentPageShapeIds()]
  if (ids.length === 0) return
  const { blob } = await editor.toImage(ids, { format: 'png', background: true, pixelRatio: 2 })
  download(blob, 'design.png')
  return blob
}

function addComponent(editor: Editor, kind: ComponentKind) {
  const c = editor.getViewportPageBounds().center
  const id = createShapeId()
  editor.createShape({
    id,
    type: kind,
    x: c.x - DEFAULT_W / 2,
    y: c.y - LOOKS[kind].defaultH / 2,
  })
  editor.select(id)
}

function loadFixture(editor: Editor) {
  editor.selectAll().deleteShapes(editor.getSelectedShapeIds())
  editor.createShapes(fixtureShapes as unknown as TLShapePartial[])
  editor.createBindings(fixtureBindings as unknown as TLBindingCreate[])
  editor.zoomToFit()
}

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [graph, setGraph] = useState<SceneGraph | null>(null)

  // Keep a live JSON preview of the graph export (also handy to eyeball arrow bindings).
  useEffect(() => {
    if (!editor) return
    const refresh = () => setGraph(exportGraph(editor))
    refresh()
    return editor.store.listen(refresh, { scope: 'document', source: 'all' })
  }, [editor])

  const json = graph ? JSON.stringify(graph, null, 2) : ''

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: 170, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid #ddd' }}>
        <strong>Palette</strong>
        {COMPONENT_KINDS.map((kind) => (
          <button key={kind} data-testid={`add-${kind}`} disabled={!editor} onClick={() => editor && addComponent(editor, kind)}>
            + {LOOKS[kind].defaultText}
          </button>
        ))}
        <button data-testid="tool-arrow" disabled={!editor} onClick={() => editor?.setCurrentTool('arrow')}>
          Arrow tool
        </button>
        <hr style={{ width: '100%' }} />
        <button data-testid="load-fixture" disabled={!editor} onClick={() => editor && loadFixture(editor)}>
          Load fixture
        </button>
        <button
          data-testid="export-json"
          disabled={!graph}
          onClick={() => download(new Blob([json], { type: 'application/json' }), 'design.graph.json')}
        >
          Export graph JSON
        </button>
        <button data-testid="export-png" disabled={!editor} onClick={() => editor && exportPng(editor)}>
          Export PNG
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw
          shapeUtils={shapeUtils}
          onMount={(e) => {
            // Exposed for manual poking / browser-driven verification only.
            ;(window as unknown as { editor: Editor }).editor = e
            setEditor(e)
          }}
        />
      </div>
      <pre
        data-testid="graph-json"
        style={{ width: 340, margin: 0, padding: 12, overflow: 'auto', fontSize: 11, borderLeft: '1px solid #ddd', background: '#fafafa' }}
      >
        {json}
      </pre>
    </div>
  )
}
