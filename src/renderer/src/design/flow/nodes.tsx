import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { COMPONENT_LOOKS, componentColors } from '../componentTypes'
import { ComponentBody } from './ComponentBody'
import { EditableText } from './EditableText'
import { useFlowActions, useFlowMode } from './flowContext'
import type { ComponentFlowNode, GroupFlowNode, NoteFlowNode } from './flowModel'
import { FLOW_PALETTES, type FlowMode } from './flowTheme'

/** Custom nodes of the canvas: the typed components, the note and the group (frame). */

const SIDES = [
  [Position.Top, 'top'],
  [Position.Right, 'right'],
  [Position.Bottom, 'bottom'],
  [Position.Left, 'left']
] as const

/**
 * One connection point on each side. They are all `source` handles: the canvas runs in loose
 * connection mode, where any handle connects to any other (the arrow's tail is where the drag
 * starts). No separate target handles to aim at.
 */
function Handles() {
  return SIDES.map(([position, id]) => (
    <Handle key={id} id={id} type="source" position={position} className="flow-handle" />
  ))
}

/**
 * New notes and groups start empty (an empty note is left out of the Design Graph). The hint that
 * says what to type is for the live canvas only: the PNG must not show text the graph lacks.
 */
const livePlaceholder = (mode: FlowMode, hint: string) => (mode === 'dark' ? hint : undefined)

export function ComponentNode({ id, data, selected, width, height }: NodeProps<ComponentFlowNode>) {
  const mode = useFlowMode()
  const { takeSnapshot, updateNodeData } = useFlowActions()
  const look = COMPONENT_LOOKS[data.componentType]
  const w = width ?? look.defaultW
  const h = height ?? look.defaultH
  return (
    <div
      className="flow-component"
      data-testid={`design-node-${data.componentType}`}
      data-component={data.componentType}
      style={{ width: w, height: h }}
    >
      <NodeResizer isVisible={selected} minWidth={80} minHeight={60} onResizeStart={takeSnapshot} />
      <svg className="flow-component-body" width={w} height={h}>
        <ComponentBody type={data.componentType} w={w} h={h} mode={mode} />
      </svg>
      {/* The label color is the mode's, inline: a stylesheet color would follow the dark theme into the export. */}
      <EditableText
        className="flow-component-label"
        color={componentColors(data.componentType, mode).text}
        label={`${look.label} label`}
        value={data.label}
        placeholder={look.label}
        onStart={takeSnapshot}
        onCommit={(label) => updateNodeData(id, { label })}
      />
      <Handles />
    </div>
  )
}

export function NoteNode({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const mode = useFlowMode()
  const palette = FLOW_PALETTES[mode].note
  const { takeSnapshot, updateNodeData } = useFlowActions()
  return (
    <div
      className="flow-note"
      data-testid="design-node-note"
      style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={100}
        minHeight={60}
        onResizeStart={takeSnapshot}
      />
      <EditableText
        multiline
        label="Note text"
        value={data.text}
        placeholder={livePlaceholder(mode, 'Note')}
        onStart={takeSnapshot}
        onCommit={(text) => updateNodeData(id, { text })}
      />
      <Handles />
    </div>
  )
}

export function GroupNode({ id, data, selected }: NodeProps<GroupFlowNode>) {
  const mode = useFlowMode()
  const palette = FLOW_PALETTES[mode].group
  const { takeSnapshot, updateNodeData } = useFlowActions()
  return (
    <div
      className="flow-group"
      data-testid="design-node-group"
      style={{ background: palette.fill, borderColor: palette.stroke, color: palette.text }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={120}
        onResizeStart={takeSnapshot}
      />
      <div className="flow-group-title">
        <EditableText
          label="Group label"
          value={data.label}
          placeholder={livePlaceholder(mode, 'Group')}
          onStart={takeSnapshot}
          onCommit={(label) => updateNodeData(id, { label })}
        />
      </div>
    </div>
  )
}

export const nodeTypes = {
  component: ComponentNode,
  note: NoteNode,
  group: GroupNode
}
