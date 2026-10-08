import {
  HTMLContainer,
  PlainTextLabel,
  Polygon2d,
  Rectangle2d,
  ShapeUtil,
  T,
  Vec,
  resizeBox,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShape,
  type TLShapePartial,
} from 'tldraw'

/**
 * Typed architecture components. Each is a tldraw custom shape with the same props:
 * size plus an editable text label. The `type` of the shape is the semantic type the
 * graph export reads, so the LLM never has to guess what a box means.
 */

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'load-balancer': ComponentProps
    cache: ComponentProps
    database: ComponentProps
    queue: ComponentProps
  }
}

interface ComponentProps {
  w: number
  h: number
  text: string
}

type ComponentKind = 'load-balancer' | 'cache' | 'database' | 'queue'
type ComponentShape = TLShape<ComponentKind>

interface Look {
  fill: string
  stroke: string
  defaultText: string
  defaultH: number
}

export const LOOKS: Record<ComponentKind, Look> = {
  'load-balancer': { fill: '#dbeafe', stroke: '#2563eb', defaultText: 'Load balancer', defaultH: 90 },
  cache: { fill: '#ffedd5', stroke: '#ea580c', defaultText: 'Cache', defaultH: 90 },
  database: { fill: '#dcfce7', stroke: '#16a34a', defaultText: 'Database', defaultH: 110 },
  queue: { fill: '#f3e8ff', stroke: '#9333ea', defaultText: 'Queue', defaultH: 90 },
}

export const DEFAULT_W = 160

/** SVG body per kind. Shared by the live component and by the SVG/PNG export. */
function Body({ kind, w, h }: { kind: ComponentKind; w: number; h: number }) {
  const { fill, stroke } = LOOKS[kind]
  const common = { fill, stroke, strokeWidth: 2.5 }
  switch (kind) {
    case 'load-balancer': {
      const c = Math.min(24, w / 4)
      return <polygon {...common} points={`${c},0 ${w - c},0 ${w},${h / 2} ${w - c},${h} ${c},${h} 0,${h / 2}`} />
    }
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

abstract class ComponentShapeUtil<S extends ComponentShape> extends ShapeUtil<S> {
  static override props = { w: T.number, h: T.number, text: T.string }

  abstract kind: ComponentKind

  override canEdit() {
    return true
  }
  override canResize() {
    return true
  }
  // Arrows may bind to this shape (the default, stated for clarity).
  override canBind() {
    return true
  }

  getDefaultProps(): S['props'] {
    const look = LOOKS[this.kind]
    return { w: DEFAULT_W, h: look.defaultH, text: look.defaultText } as S['props']
  }

  getGeometry(shape: S) {
    // Arrow bindings anchor on this geometry, so it decides where arrows touch the shape.
    const { w, h } = shape.props
    if (this.kind === 'load-balancer') {
      const c = Math.min(24, w / 4)
      return new Polygon2d({
        points: [new Vec(c, 0), new Vec(w - c, 0), new Vec(w, h / 2), new Vec(w - c, h), new Vec(c, h), new Vec(0, h / 2)],
        isFilled: true,
      })
    }
    return new Rectangle2d({ width: w, height: h, isFilled: true })
  }

  override onResize(shape: S, info: TLResizeInfo<S>) {
    // Generic S makes resizeBox's return type unassignable; the runtime value is a valid partial.
    return resizeBox(shape, info) as unknown as TLShapePartial<S>
  }

  component(shape: S) {
    return <ComponentView shape={shape} kind={this.kind} />
  }

  getIndicatorPath(shape: S) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  /**
   * SVG used by editor.toImage / getSvgString. The live component uses an HTML label, which would
   * go through foreignObject on export; a plain <text> is more robust for PNG rasterization.
   */
  override toSvg(shape: S) {
    const { w, h, text } = shape.props
    return (
      <g>
        <Body kind={this.kind} w={w} h={h} />
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16}
          fontFamily="sans-serif"
          fill="#1d1d1d"
        >
          {text}
        </text>
      </g>
    )
  }
}

function ComponentView({ shape, kind }: { shape: ComponentShape; kind: ComponentKind }) {
  const editor = useEditor()
  const isSelected = useValue('isSelected', () => editor.getOnlySelectedShapeId() === shape.id, [editor, shape.id])
  const { w, h, text } = shape.props
  return (
    <HTMLContainer style={{ width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', overflow: 'visible' }}>
        <Body kind={kind} w={w} h={h} />
      </svg>
      <PlainTextLabel
        shapeId={shape.id}
        type={shape.type}
        text={text}
        isSelected={isSelected}
        fontFamily="var(--tl-font-sans)"
        fontSize={16}
        lineHeight={1.3}
        textAlign="center"
        verticalAlign="middle"
        labelColor="#1d1d1d"
        wrap
        showTextOutline={false}
        padding={8}
      />
    </HTMLContainer>
  )
}

export class LoadBalancerShapeUtil extends ComponentShapeUtil<TLShape<'load-balancer'>> {
  static override type = 'load-balancer' as const
  kind = 'load-balancer' as const
}
export class CacheShapeUtil extends ComponentShapeUtil<TLShape<'cache'>> {
  static override type = 'cache' as const
  kind = 'cache' as const
}
export class DatabaseShapeUtil extends ComponentShapeUtil<TLShape<'database'>> {
  static override type = 'database' as const
  kind = 'database' as const
}
export class QueueShapeUtil extends ComponentShapeUtil<TLShape<'queue'>> {
  static override type = 'queue' as const
  kind = 'queue' as const
}

export const componentShapeUtils = [LoadBalancerShapeUtil, CacheShapeUtil, DatabaseShapeUtil, QueueShapeUtil]
export const COMPONENT_KINDS = Object.keys(LOOKS) as ComponentKind[]
export type { ComponentKind }
