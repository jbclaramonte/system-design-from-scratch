import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { EDGE_DIRECTIONS, type EdgeDirection } from '../../../../shared/designGraph'
import { useFlowActions, useFlowMode } from './flowContext'
import type { FlowEdge } from './flowModel'
import { FLOW_PALETTES } from './flowTheme'

const DIRECTION_BUTTONS: Record<EdgeDirection, { glyph: string; name: string }> = {
  none: { glyph: '—', name: 'No arrow' },
  forward: { glyph: '→', name: 'One way' },
  backward: { glyph: '←', name: 'One way, reversed' },
  both: { glyph: '↔', name: 'Both ways' }
}

/**
 * Connection between two nodes: an orthogonal path, arrowheads from `data.direction` (set as
 * markers on the edge), an optional label on the path. The selected edge shows its direction
 * buttons and a label field.
 */
export function LinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  data,
  selected
}: EdgeProps<FlowEdge>) {
  const palette = FLOW_PALETTES[useFlowMode()]
  const { takeSnapshot, updateEdge } = useFlowActions()
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10
  })
  const label = data?.label ?? ''
  const direction = data?.direction ?? 'forward'
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ stroke: selected ? palette.edgeSelected : palette.edge, strokeWidth: 2 }}
      />
      {(label || selected) && (
        <EdgeLabelRenderer>
          <div
            className="flow-edge-label nodrag nopan"
            data-testid="design-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: palette.label.fill,
              color: palette.label.text
            }}
          >
            {selected ? (
              <>
                <input
                  className="flow-text-field flow-edge-input"
                  aria-label="Connection label"
                  placeholder="label"
                  value={label}
                  size={Math.max(6, label.length + 1)}
                  onFocus={takeSnapshot}
                  onChange={(event) => updateEdge(id, { label: event.target.value })}
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <span className="flow-edge-directions" role="group" aria-label="Direction">
                  {EDGE_DIRECTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className="flow-edge-direction"
                      title={DIRECTION_BUTTONS[value].name}
                      aria-label={DIRECTION_BUTTONS[value].name}
                      aria-pressed={direction === value}
                      data-testid={`design-edge-direction-${value}`}
                      onClick={() => {
                        takeSnapshot()
                        updateEdge(id, { direction: value })
                      }}
                    >
                      {DIRECTION_BUTTONS[value].glyph}
                    </button>
                  ))}
                </span>
              </>
            ) : (
              label
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { link: LinkEdge }
