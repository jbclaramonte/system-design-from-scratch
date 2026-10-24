import {
  ConnectionMode,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState
} from '@xyflow/react'
import { toCanvas } from 'html-to-image'
import { useEffect, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import {
  DESIGN_PNG_MAX_SIDE,
  designPngSchema,
  type DesignPng
} from '../../../../shared/designGraph'
import { FlowModeContext } from '../flow/flowContext'
import { EXPORT_TOKENS_THEME } from '../flow/flowTheme'
import { toFlow, type FlowEdge, type FlowNode } from '../flow/flowModel'
import { edgeTypes } from '../flow/LinkEdge'
import { nodeTypes } from '../flow/nodes'
import type { Scene } from '../flow/scene'
import { bytesToBase64, fitWithin } from './pngEncoding'
import { pngLayout, sceneBounds } from './pngLayout'

/**
 * PNG capture of a Design Scene for the LLM evaluation.
 *
 * - The scene is drawn by a second, off-screen React Flow in the `export` mode (dark strokes on
 *   white), not by the live canvas: the theme of the app cannot leak into the image, and the live canvas
 *   does not flash. It works from a stored scene, without the editor being mounted.
 * - Opaque white, longest side at most `DESIGN_PNG_MAX_SIDE` (1568 px), small scenes at 2x.
 * - React Flow's own panels (attribution, controls) are left out of the capture; the live canvas
 *   keeps its attribution.
 */

const READY_TIMEOUT_MS = 10_000

function ReadyProbe({ onReady }: { onReady: () => void }) {
  const initialized = useNodesInitialized()
  useEffect(() => {
    if (!initialized) return
    // Two frames after the nodes are measured: the edges need the handle positions.
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(onReady)
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [initialized, onReady])
  return null
}

/** Off-screen light canvas of `scene` at zoom 1, in a frame of the layout size. */
function ExportFrame({
  scene,
  layout,
  onReady
}: {
  scene: Scene
  layout: ReturnType<typeof pngLayout>
  onReady: () => void
}) {
  // Controlled mode: React Flow reports the measured sizes through `onNodesChange`, and the nodes
  // only count as initialized (and the edges only draw) once they are stored back.
  const initial = useMemo(() => toFlow(scene, 'export'), [scene])
  const [nodes, , onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges] = useEdgesState<FlowEdge>(initial.edges)
  return (
    <FlowModeContext value="export">
      <div
        className="flow-export-frame"
        style={{ width: layout.width, height: layout.height, background: '#ffffff' }}
      >
        <ReactFlow
          id="design-export"
          colorMode="light"
          nodes={nodes}
          onNodesChange={onNodesChange}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={{ x: layout.translateX, y: layout.translateY, zoom: 1 }}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.01}
        >
          <ReadyProbe onReady={onReady} />
        </ReactFlow>
      </div>
    </FlowModeContext>
  )
}

/** PNG of the scene, or `null` when it has no node. */
export async function exportDesignPng(scene: Scene): Promise<DesignPng | null> {
  const bounds = sceneBounds(scene.nodes)
  if (!bounds) return null
  const layout = pngLayout(bounds)

  // Off-screen but laid out (not display:none), so the browser measures and paints it.
  const host = document.createElement('div')
  host.className = 'flow-export-host'
  host.setAttribute('aria-hidden', 'true')
  host.dataset['theme'] = EXPORT_TOKENS_THEME
  document.body.append(host)
  const root = createRoot(host)
  try {
    // A hidden window (minimized, occluded) runs no animation frames and no ResizeObserver: the
    // canvas never gets measured. Fail with a message instead of waiting forever.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('PNG export timed out: is the window visible?')),
        READY_TIMEOUT_MS
      )
      root.render(
        <ExportFrame
          scene={scene}
          layout={layout}
          onReady={() => {
            clearTimeout(timer)
            resolve()
          }}
        />
      )
    })
    await document.fonts.ready
    const frame = host.querySelector<HTMLElement>('.flow-export-frame')
    if (!frame) throw new Error('The export canvas did not render')
    const captured = await toCanvas(frame, {
      width: layout.width,
      height: layout.height,
      pixelRatio: layout.pixelRatio,
      backgroundColor: '#ffffff',
      // Left out of the capture: the attribution panel of React Flow.
      filter: (node) =>
        !(node instanceof HTMLElement && node.classList.contains('react-flow__panel'))
    })

    // Flatten on opaque white and clamp to the limit (labels or arrowheads may overflow a pixel).
    const { width, height } = fitWithin(captured.width, captured.height, DESIGN_PNG_MAX_SIDE)
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const context = out.getContext('2d')
    if (!context) throw new Error('Could not create a 2D canvas for the PNG export')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(captured, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not encode the PNG')
    return designPngSchema.parse({
      base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      width,
      height
    })
  } finally {
    root.unmount()
    host.remove()
  }
}
