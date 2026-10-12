import { componentColors, LIGHT_LABEL_COLOR } from '../componentTypes'

/**
 * Colors of the React Flow canvas (spike #42). `dark` is the live canvas and uses the design
 * tokens; `light` is the Design Export (PNG): dark strokes on opaque white, literal colors because
 * the capture must not depend on the dark theme. Component colors come from `componentColors`.
 */
export type FlowMode = 'dark' | 'light'

export interface FlowPalette {
  edge: string
  edgeSelected: string
  /** Edge label chip. */
  label: { fill: string; text: string }
  note: { fill: string; stroke: string; text: string }
  group: { fill: string; stroke: string; text: string }
}

export const FLOW_PALETTES: Record<FlowMode, FlowPalette> = {
  dark: {
    edge: 'var(--color-text-secondary)',
    edgeSelected: 'var(--color-border-focus)',
    label: { fill: 'var(--color-canvas)', text: 'var(--color-text-primary)' },
    note: {
      fill: 'var(--color-surface-elevated)',
      stroke: 'var(--color-attention)',
      text: 'var(--color-text-primary)'
    },
    group: {
      fill: 'var(--color-hover)',
      stroke: 'var(--color-border-active)',
      text: 'var(--color-text-secondary)'
    }
  },
  light: {
    edge: '#334155',
    edgeSelected: '#334155',
    label: { fill: '#ffffff', text: LIGHT_LABEL_COLOR },
    note: { fill: '#fef9c3', stroke: '#ca8a04', text: LIGHT_LABEL_COLOR },
    group: { fill: 'rgba(100, 116, 139, 0.06)', stroke: '#64748b', text: '#475569' }
  }
}

export { componentColors }
