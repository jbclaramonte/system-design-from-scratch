import { componentColors, loadBalancerPoints, type ComponentType } from '../componentTypes'
import type { FlowMode } from './flowTheme'

/**
 * SVG body of a component node, one drawing per type. Same drawings as the tldraw shapes
 * (`componentShapes.tsx`, which cannot be imported without tldraw): the spike copies them, the
 * migration (#43) deletes the tldraw copy.
 */
export function ComponentBody({
  type,
  w,
  h,
  mode
}: {
  type: ComponentType
  w: number
  h: number
  mode: FlowMode
}) {
  const { fill, stroke } = componentColors(type, mode)
  const common = { fill, stroke, strokeWidth: 2.5 }
  switch (type) {
    case 'client':
      // A browser window: frame, title bar and three dots.
      return (
        <g {...common}>
          <rect width={w} height={h} rx={8} />
          <line x1={0} x2={w} y1={18} y2={18} strokeWidth={1.5} />
          {[12, 24, 36].map((cx) => (
            <circle key={cx} cx={cx} cy={9} r={3} fill={stroke} stroke="none" />
          ))}
        </g>
      )
    case 'cdn':
      return <rect {...common} width={w} height={h} rx={Math.min(h, w) / 2} />
    case 'load-balancer':
      return (
        <polygon
          {...common}
          points={loadBalancerPoints(w, h)
            .map(({ x, y }) => `${x},${y}`)
            .join(' ')}
        />
      )
    case 'service':
      // A box with a thick left accent bar.
      return (
        <g {...common}>
          <rect width={w} height={h} rx={4} />
          <line x1={6} x2={6} y1={4} y2={h - 4} strokeWidth={5} />
        </g>
      )
    case 'cache':
      return <rect {...common} width={w} height={h} rx={14} strokeDasharray="8 5" />
    case 'database': {
      const ry = Math.min(14, h / 6)
      return (
        <g {...common}>
          <path d={`M0,${ry} V${h - ry} A${w / 2},${ry} 0 0 0 ${w},${h - ry} V${ry}`} />
          <ellipse cx={w / 2} cy={ry} rx={w / 2} ry={ry} />
        </g>
      )
    }
    case 'queue':
      return (
        <g {...common}>
          <rect width={w} height={h} rx={6} />
          {[1, 2, 3].map((i) => (
            <line key={i} x1={(w * i) / 4} x2={(w * i) / 4} y1={0} y2={h} strokeWidth={1.5} />
          ))}
        </g>
      )
  }
}
