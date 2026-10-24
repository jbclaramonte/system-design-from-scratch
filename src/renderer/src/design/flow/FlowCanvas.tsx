import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './flowCanvas.css'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref
} from 'react'
import { COMPONENT_TYPES } from '../../../../shared/designGraph'
import { COMPONENT_LOOKS, componentColors, type ComponentType } from '../componentTypes'
import { FlowActionsContext, FlowModeContext, type FlowActions } from './flowContext'
import {
  copySelection,
  createComponentNode,
  createEdge,
  createGroupNode,
  createNoteNode,
  edgeMarkers,
  GRID,
  pasteClipboard,
  reparentDropped,
  sortParentsFirst,
  toFlow,
  toScene,
  type ClipboardContent,
  type FlowEdge,
  type FlowNode
} from './flowModel'
import { emptyHistory, record, redo, undo, type History } from './history'
import { edgeTypes } from './LinkEdge'
import { nodeTypes } from './nodes'
import type { Scene } from './scene'

/**
 * What the host of the canvas can ask of it (a ref, so the host stays outside the canvas). The
 * handle is stable for the life of the canvas, and keeps answering after it unmounts (the last
 * state), so a pending autosave can still capture the scene while the canvas goes away.
 */
export interface FlowCanvasHandle {
  /** The scene as it would be stored (`serializeScene` it), straight from the nodes and edges. */
  getScene(): Scene
}

interface FlowCanvasProps {
  initialScene: Scene
  /** Fires after every change worth saving (not for selection, measures or panning). */
  onDirty?: () => void
  handle?: Ref<FlowCanvasHandle>
  /** Shown at the end of the palette bar (the save error, for instance). */
  paletteNotice?: ReactNode
}

interface Snapshot {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const snap = (value: number) => Math.round(value / GRID) * GRID

/**
 * Design Canvas engine on React Flow: palette of typed components, notes and groups, connections
 * with directions and labels, undo and redo, copy and paste. Mount it with the scene to open
 * (`EMPTY_SCENE` for a new one) and a `key` to switch scenes: the scene is read once. Loading,
 * autosave and the Design Export belong to the host (`DesignCanvas`).
 */
export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowEditor {...props} />
    </ReactFlowProvider>
  )
}

function FlowEditor({ initialScene, onDirty, handle, paletteNotice }: FlowCanvasProps) {
  const initial = useMemo(() => toFlow(initialScene, 'dark'), [initialScene])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initial.edges)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const rf = useReactFlow<FlowNode, FlowEdge>()
  const surface = useRef<HTMLDivElement>(null)

  // Always the latest state, for handlers that must not close over a stale one.
  const latest = useRef<Snapshot>({ nodes, edges })
  useEffect(() => {
    latest.current = { nodes, edges }
  })

  // Undo and redo: React Flow has none. Snapshots are taken right before each change.
  const history = useRef<History<Snapshot>>(emptyHistory())
  const [steps, setSteps] = useState({ undo: 0, redo: 0 })
  const refresh = () =>
    setSteps({ undo: history.current.past.length, redo: history.current.future.length })
  const takeSnapshot = useCallback(() => {
    history.current = record(history.current, latest.current)
    setSteps({ undo: history.current.past.length, redo: 0 })
  }, [])
  const restore = (step: { state: Snapshot; history: History<Snapshot> } | null) => {
    if (!step) return
    history.current = step.history
    setNodes(step.state.nodes)
    setEdges(step.state.edges)
    refresh()
    onDirty?.()
  }
  const doUndo = () => restore(undo(history.current, latest.current))
  const doRedo = () => restore(redo(history.current, latest.current))

  const clipboard = useRef<ClipboardContent | null>(null)
  const pastes = useRef(0)
  const doCopy = () => {
    const copied = copySelection(latest.current.nodes, latest.current.edges)
    if (copied.nodes.length === 0) return
    clipboard.current = copied
    pastes.current = 0
  }
  const doPaste = () => {
    if (!clipboard.current) return
    takeSnapshot()
    pastes.current += 1
    const pasted = pasteClipboard(
      clipboard.current,
      () => newId('p'),
      'dark',
      GRID * 2 * pastes.current
    )
    setNodes((current) =>
      sortParentsFirst([...current.map((n) => ({ ...n, selected: false })), ...pasted.nodes])
    )
    setEdges((current) => [...current.map((e) => ({ ...e, selected: false })), ...pasted.edges])
    onDirty?.()
  }

  const actions = useMemo<FlowActions>(
    () => ({
      takeSnapshot,
      updateNodeData: (nodeId, patch) => {
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId ? ({ ...node, data: { ...node.data, ...patch } } as FlowNode) : node
          )
        )
        onDirty?.()
      },
      updateEdge: (edgeId, patch) => {
        setEdges((current) =>
          current.map((edge) => {
            if (edge.id !== edgeId || !edge.data) return edge
            const data = { ...edge.data, ...patch }
            return { ...edge, data, ...edgeMarkers(data.direction, 'dark') }
          })
        )
        onDirty?.()
      }
    }),
    [takeSnapshot, setNodes, setEdges, onDirty]
  )

  // Stable, and valid after unmount: `latest` and the store of `rf` outlive the render tree.
  useImperativeHandle(
    handle,
    () => ({
      getScene: () => {
        const { x, y, zoom } = rf.getViewport()
        return toScene(latest.current.nodes, latest.current.edges, { x, y, zoom })
      }
    }),
    [rf]
  )

  // --- Adding nodes --------------------------------------------------------------------------

  const added = useRef(0)
  const addNode = (
    make: (id: string, at: { x: number; y: number }) => FlowNode,
    size: [number, number]
  ) => {
    const box = surface.current?.getBoundingClientRect()
    if (!box) return
    takeSnapshot()
    const center = rf.screenToFlowPosition({
      x: box.left + box.width / 2,
      y: box.top + box.height / 2
    })
    // A small stagger so successive additions do not stack exactly.
    const stagger = (added.current++ % 6) * GRID
    const node = make(newId('n'), {
      x: snap(center.x - size[0] / 2 + stagger),
      y: snap(center.y - size[1] / 2 + stagger)
    })
    setNodes((current) =>
      sortParentsFirst([
        ...current.map((n) => ({ ...n, selected: false })),
        { ...node, selected: true }
      ])
    )
    onDirty?.()
  }
  const addComponent = (type: ComponentType) => {
    const { defaultW, defaultH } = COMPONENT_LOOKS[type]
    addNode((id, at) => createComponentNode(id, type, at), [defaultW, defaultH])
  }

  // --- React Flow callbacks ------------------------------------------------------------------

  // Selection and the measures React Flow reports on its own are not worth a save; a resize by the
  // user is (it comes with `resizing` or `setAttributes`).
  const isDirtyChange = (
    changes: readonly { type: string; resizing?: boolean; setAttributes?: unknown }[]
  ) =>
    changes.some(
      (change) =>
        change.type !== 'select' &&
        (change.type !== 'dimensions' || change.resizing !== undefined || !!change.setAttributes)
    )

  const onConnect = (connection: Connection) => {
    takeSnapshot()
    setEdges((current) => [...current, createEdge(newId('e'), connection, 'dark')])
    onDirty?.()
  }

  const reparent = (dragged: readonly { id: string }[]) => {
    // React Flow never changes `parentId` on its own: do it here, once the drop is over.
    setNodes((current) => reparentDropped(current, new Set(dragged.map((n) => n.id))))
    onDirty?.()
  }

  const onKeyDown = (event: globalThis.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (target.closest?.('input, textarea, [contenteditable="true"]')) return
    if (!(event.metaKey || event.ctrlKey)) return
    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) doRedo()
      else doUndo()
    } else if (key === 'y') {
      event.preventDefault()
      doRedo()
    } else if (key === 'c') {
      event.preventDefault()
      doCopy()
    } else if (key === 'v') {
      event.preventDefault()
      doPaste()
    } else if (key === 'a') {
      event.preventDefault()
      setNodes((current) => current.map((n) => ({ ...n, selected: true })))
    }
  }

  // On the window, not on the canvas: deleting the focused node drops the focus to the page body,
  // and Undo must still work then. The listener lives as long as the canvas is mounted.
  const keyHandler = useRef(onKeyDown)
  useEffect(() => {
    keyHandler.current = onKeyDown
  })
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => keyHandler.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <FlowModeContext value="dark">
      <FlowActionsContext value={actions}>
        {/* Stays dark in the light theme until #63: the nodes are drawn with the dark palette. */}
        <div className="design-canvas" data-theme="dark" data-testid="design-canvas">
          <aside className="design-palette" data-testid="design-palette" aria-label="Components">
            <p className="design-palette-title label-caps">Components</p>
            {COMPONENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="design-palette-button btn-sm"
                data-testid={`add-${type}`}
                style={{ '--swatch': componentColors(type, 'dark').stroke } as CSSProperties}
                onClick={() => addComponent(type)}
              >
                + {COMPONENT_LOOKS[type].label}
              </button>
            ))}
            <span className="design-palette-divider" aria-hidden />
            <button
              type="button"
              className="design-palette-button btn-sm"
              data-testid="add-note"
              onClick={() => addNode(createNoteNode, [200, 120])}
            >
              + Note
            </button>
            <button
              type="button"
              className="design-palette-button btn-sm"
              data-testid="add-group"
              onClick={() => addNode(createGroupNode, [480, 320])}
            >
              + Group
            </button>
            <span className="design-palette-divider" aria-hidden />
            <button
              type="button"
              className="btn-sm"
              data-testid="design-undo"
              disabled={steps.undo === 0}
              onClick={doUndo}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn-sm"
              data-testid="design-redo"
              disabled={steps.redo === 0}
              onClick={doRedo}
            >
              Redo
            </button>
            <label className="design-palette-toggle">
              <input
                type="checkbox"
                data-testid="design-snap"
                checked={snapToGrid}
                onChange={(event) => setSnapToGrid(event.target.checked)}
              />
              Snap to grid
            </label>
            {paletteNotice}
          </aside>
          <div ref={surface} className="design-surface" data-testid="design-surface">
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              colorMode="dark"
              defaultViewport={initial.viewport}
              onNodesChange={(changes) => {
                onNodesChange(changes)
                if (isDirtyChange(changes)) onDirty?.()
              }}
              onEdgesChange={(changes) => {
                onEdgesChange(changes)
                if (isDirtyChange(changes)) onDirty?.()
              }}
              onConnect={onConnect}
              // A connection from a node to itself draws a loop that reads as noise.
              isValidConnection={(connection) => connection.source !== connection.target}
              connectionMode={ConnectionMode.Loose}
              onNodeDragStart={takeSnapshot}
              onSelectionDragStart={takeSnapshot}
              onNodeDragStop={(_event, _node, dragged) => reparent(dragged)}
              onSelectionDragStop={(_event, dragged) => reparent(dragged)}
              onBeforeDelete={async () => {
                takeSnapshot()
                return true
              }}
              snapToGrid={snapToGrid}
              snapGrid={[GRID, GRID]}
              deleteKeyCode={['Backspace', 'Delete']}
              // Whiteboard feel: drag on the empty canvas selects, middle or right button pans,
              // the trackpad scrolls and pinches.
              selectionOnDrag
              panOnDrag={[1, 2]}
              panOnScroll
              zoomOnDoubleClick={false}
              minZoom={0.1}
              maxZoom={2}
              fitViewOptions={{ padding: 0.2 }}
            >
              <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.5} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>
      </FlowActionsContext>
    </FlowModeContext>
  )
}
