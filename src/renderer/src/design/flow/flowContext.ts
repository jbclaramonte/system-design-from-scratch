import { createContext, useContext } from 'react'
import type { EdgeDirection } from '../../../../shared/designGraph'
import type { FlowMode } from './flowTheme'

/** Color mode of the canvas being drawn: `dark` live, `light` for the PNG export. */
export const FlowModeContext = createContext<FlowMode>('dark')
export const useFlowMode = () => useContext(FlowModeContext)

/** What nodes and edges ask of the editor. The export renderer provides no-ops. */
export interface FlowActions {
  /** Remember the current state as an undo step. Call it right before a change. */
  takeSnapshot(): void
  updateNodeData(nodeId: string, patch: Record<string, unknown>): void
  updateEdge(edgeId: string, patch: { label?: string; direction?: EdgeDirection }): void
}

const noop = () => undefined
export const FlowActionsContext = createContext<FlowActions>({
  takeSnapshot: noop,
  updateNodeData: noop,
  updateEdge: noop
})
export const useFlowActions = () => useContext(FlowActionsContext)
