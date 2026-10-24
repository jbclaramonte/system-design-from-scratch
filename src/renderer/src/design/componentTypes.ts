/**
 * Catalogue of the typed components of the Design Canvas. Each component node carries its
 * semantic type (`data.componentType`), read by the graph export, so the LLM never has to guess
 * what a box means. Pure data, no React: safe to reuse outside the editor.
 *
 * The list of types lives in `src/shared/designGraph.ts`, so the main process can validate a
 * Design Graph against it.
 */

import type { ComponentType } from '../../../shared/designGraph'

export { COMPONENT_TYPES, isComponentType, type ComponentType } from '../../../shared/designGraph'

export interface ComponentLook {
  /** Default label, also the palette button text. */
  label: string
  /** Light palette: the live canvas in the Light theme and the Design Export (PNG). */
  fill: string
  stroke: string
  defaultW: number
  defaultH: number
}

export const COMPONENT_LOOKS: Record<ComponentType, ComponentLook> = {
  client: { label: 'Client', fill: '#f1f5f9', stroke: '#475569', defaultW: 160, defaultH: 100 },
  cdn: { label: 'CDN', fill: '#ccfbf1', stroke: '#0d9488', defaultW: 160, defaultH: 80 },
  'load-balancer': {
    label: 'Load balancer',
    fill: '#dbeafe',
    stroke: '#2563eb',
    defaultW: 160,
    defaultH: 90
  },
  service: { label: 'Service', fill: '#e0e7ff', stroke: '#4f46e5', defaultW: 160, defaultH: 90 },
  cache: { label: 'Cache', fill: '#ffedd5', stroke: '#ea580c', defaultW: 160, defaultH: 90 },
  database: { label: 'Database', fill: '#dcfce7', stroke: '#16a34a', defaultW: 160, defaultH: 110 },
  queue: { label: 'Queue', fill: '#f3e8ff', stroke: '#9333ea', defaultW: 160, defaultH: 90 }
}

/** Outline of the load balancer hexagon. */
export function loadBalancerPoints(w: number, h: number): Array<{ x: number; y: number }> {
  const c = Math.min(24, w / 4)
  return [
    { x: c, y: 0 },
    { x: w - c, y: 0 },
    { x: w, y: h / 2 },
    { x: w - c, y: h },
    { x: c, y: h },
    { x: 0, y: h / 2 }
  ]
}

/**
 * Where a component is drawn. `dark` and `light` are the live Design Canvas in the Dark and the
 * Light theme; `export` is the Design Export (PNG): dark strokes on opaque white, literal colors,
 * the same whatever the theme of the app.
 */
export type ComponentColorMode = 'dark' | 'light' | 'export'

export interface ComponentColors {
  fill: string
  stroke: string
  /** Label color. */
  text: string
}

/**
 * Dark palette of the live canvas: the stroke hue of each type (same hue as the light stroke, one
 * step lighter) over a deep tint of that hue. Fills stay opaque so arrows never show through.
 */
const DARK_COLORS: Record<ComponentType, { fill: string; stroke: string }> = {
  client: { fill: '#1e293b', stroke: '#94a3b8' },
  cdn: { fill: '#0b2c2b', stroke: '#2dd4bf' },
  'load-balancer': { fill: '#0f2547', stroke: '#60a5fa' },
  service: { fill: '#1e1b4b', stroke: '#818cf8' },
  cache: { fill: '#34200f', stroke: '#fb923c' },
  database: { fill: '#0d2c1d', stroke: '#34d399' },
  queue: { fill: '#2b1545', stroke: '#c084fc' }
}

/** Text of a component in the Design Export: dark on a pale fill, the LLM reads dark strokes on white. */
export const EXPORT_LABEL_COLOR = '#1d1d1d'
/** Text of a component on the live canvas: the `text-primary` token of the theme. */
export const LIVE_LABEL_COLOR = 'var(--color-text-primary)'

/**
 * Fill, stroke and label color of a component type for a color mode. The hue of a type is the
 * same everywhere: the light palette serves the Light theme and the export, the dark one is the
 * same hues one step lighter over a deep tint.
 */
export function componentColors(type: ComponentType, mode: ComponentColorMode): ComponentColors {
  if (mode === 'dark') return { ...DARK_COLORS[type], text: LIVE_LABEL_COLOR }
  const { fill, stroke } = COMPONENT_LOOKS[type]
  return { fill, stroke, text: mode === 'export' ? EXPORT_LABEL_COLOR : LIVE_LABEL_COLOR }
}
