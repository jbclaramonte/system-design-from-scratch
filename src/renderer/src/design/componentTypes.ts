/**
 * Catalogue of the typed shapes of the Design Canvas. Each component type is a tldraw custom shape
 * whose `type` is the semantic type read by the graph export (issue #13), so the LLM never has to
 * guess what a box means. Pure data, no tldraw import: safe to reuse outside the editor.
 */

export const COMPONENT_TYPES = [
  'client',
  'cdn',
  'load-balancer',
  'service',
  'cache',
  'database',
  'queue'
] as const

export type ComponentType = (typeof COMPONENT_TYPES)[number]

export interface ComponentLook {
  /** Default label, also the palette button text. */
  label: string
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

export function isComponentType(type: string): type is ComponentType {
  return (COMPONENT_TYPES as readonly string[]).includes(type)
}

/** Outline of the load balancer hexagon, shared by its drawing and its arrow-binding geometry. */
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
