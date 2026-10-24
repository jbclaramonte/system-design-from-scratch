import { componentColors, EXPORT_LABEL_COLOR, type ComponentColorMode } from '../componentTypes'
import type { ResolvedTheme } from '../../../../shared/theme'

/**
 * Colors of the React Flow canvas, by mode.
 *
 * - `dark` and `light` are the live canvas in the Dark and the Light theme. Their colors are design
 *   tokens (`var(--color-...)`), so the canvas follows the tokens of the theme it sits in; the two
 *   palettes name the same tokens where the role is the same.
 * - `export` is the Design Export (PNG): dark strokes on opaque white, literal colors because the
 *   capture must not depend on the theme of the app.
 *
 * Component colors come from `componentColors`.
 */
export type FlowMode = ComponentColorMode

/**
 * Theme of the tokens the export reads (font, sizes, radii of `flowCanvas.css`). The colors of the
 * image are literal (`export` mode), but the tokens differ by theme, so the export host is pinned
 * to one theme and the PNG is the same whether the app shows Light or Dark.
 */
export const EXPORT_TOKENS_THEME: ResolvedTheme = 'dark'

/** The mode of the live canvas in a theme. */
export const flowModeOfTheme = (theme: ResolvedTheme): FlowMode => theme

export interface FlowPalette {
  edge: string
  edgeSelected: string
  /** Edge label chip. */
  label: { fill: string; text: string }
  note: { fill: string; stroke: string; text: string }
  group: { fill: string; stroke: string; text: string }
}

/** Colors that mean the same in both live themes: only the tokens differ. */
const LIVE_EDGE = {
  edge: 'var(--color-text-secondary)',
  edgeSelected: 'var(--color-border-focus)'
}

export const FLOW_PALETTES: Record<FlowMode, FlowPalette> = {
  dark: {
    ...LIVE_EDGE,
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
    ...LIVE_EDGE,
    // White chip like the cards, so a label stays readable over a line on the peach canvas.
    label: { fill: 'var(--color-surface-base)', text: 'var(--color-text-primary)' },
    // A honey sticky: opaque (a line passing behind must not show through), warm border.
    note: {
      fill: 'color-mix(in srgb, var(--color-attention) 18%, var(--color-surface-base))',
      stroke: 'var(--color-attention)',
      text: 'var(--color-text-primary)'
    },
    group: {
      fill: 'var(--color-hover)',
      stroke: 'var(--color-border-active)',
      text: 'var(--color-text-secondary)'
    }
  },
  export: {
    edge: '#334155',
    edgeSelected: '#334155',
    label: { fill: '#ffffff', text: EXPORT_LABEL_COLOR },
    note: { fill: '#fef9c3', stroke: '#ca8a04', text: EXPORT_LABEL_COLOR },
    group: { fill: 'rgba(100, 116, 139, 0.06)', stroke: '#64748b', text: '#475569' }
  }
}

export { componentColors }
