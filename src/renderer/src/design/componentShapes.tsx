import {
  HTMLContainer,
  PlainTextLabel,
  Polygon2d,
  Rectangle2d,
  ShapeUtil,
  T,
  Vec,
  resizeBox,
  useColorMode,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShape,
  type TLShapePartial
} from 'tldraw'
import {
  COMPONENT_LOOKS,
  componentColors,
  loadBalancerPoints,
  type ComponentColorMode,
  type ComponentType
} from './componentTypes'

/**
 * tldraw custom shapes for the component types of the Design Canvas. Every type has the same
 * props (size plus an editable plain-text label) and differs only by its drawing.
 */

export interface ComponentProps {
  w: number
  h: number
  text: string
}

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    client: ComponentProps
    cdn: ComponentProps
    'load-balancer': ComponentProps
    service: ComponentProps
    cache: ComponentProps
    database: ComponentProps
    queue: ComponentProps
  }
}

type ComponentShape = TLShape<ComponentType>

/**
 * SVG body per type. Shared by the live component (color mode of the editor, dark on the Design
 * Canvas) and by the SVG/PNG export (always `light`, so the LLM sees dark strokes on white).
 */
function Body({
  type,
  w,
  h,
  mode
}: {
  type: ComponentType
  w: number
  h: number
  mode: ComponentColorMode
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

abstract class ComponentShapeUtil<S extends ComponentShape> extends ShapeUtil<S> {
  static override props = { w: T.number, h: T.number, text: T.string }

  abstract componentType: ComponentType

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
    const { defaultW, defaultH, label } = COMPONENT_LOOKS[this.componentType]
    return { w: defaultW, h: defaultH, text: label } as S['props']
  }

  getGeometry(shape: S) {
    // Arrow bindings anchor on this geometry, so it decides where arrows touch the shape.
    const { w, h } = shape.props
    if (this.componentType === 'load-balancer') {
      return new Polygon2d({
        points: loadBalancerPoints(w, h).map(({ x, y }) => new Vec(x, y)),
        isFilled: true
      })
    }
    return new Rectangle2d({ width: w, height: h, isFilled: true })
  }

  override onResize(shape: S, info: TLResizeInfo<S>) {
    // Generic S makes resizeBox's return type unassignable; the runtime value is a valid partial.
    return resizeBox(shape, info) as unknown as TLShapePartial<S>
  }

  component(shape: S) {
    return <ComponentView shape={shape} />
  }

  getIndicatorPath(shape: S) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }

  /**
   * SVG used by image export. The live component uses an HTML label, which would go through
   * foreignObject on export; a plain <text> is more robust for PNG rasterization. Always the
   * light palette, whatever the editor theme: exports stay dark on white.
   */
  override toSvg(shape: S) {
    const { w, h, text } = shape.props
    return (
      <g>
        <Body type={this.componentType} w={w} h={h} mode="light" />
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={16}
          fontFamily="sans-serif"
          fill={componentColors(this.componentType, 'light').text}
        >
          {text}
        </text>
      </g>
    )
  }
}

function ComponentView({ shape }: { shape: ComponentShape }) {
  const editor = useEditor()
  const isSelected = useValue('isSelected', () => editor.getOnlySelectedShapeId() === shape.id, [
    editor,
    shape.id
  ])
  const mode = useColorMode()
  const { w, h, text } = shape.props
  return (
    <HTMLContainer style={{ width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', overflow: 'visible' }}>
        <Body type={shape.type} w={w} h={h} mode={mode} />
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
        labelColor={componentColors(shape.type, mode).text}
        wrap
        showTextOutline={false}
        padding={8}
      />
    </HTMLContainer>
  )
}

export class ClientShapeUtil extends ComponentShapeUtil<TLShape<'client'>> {
  static override type = 'client' as const
  componentType = 'client' as const
}
export class CdnShapeUtil extends ComponentShapeUtil<TLShape<'cdn'>> {
  static override type = 'cdn' as const
  componentType = 'cdn' as const
}
export class LoadBalancerShapeUtil extends ComponentShapeUtil<TLShape<'load-balancer'>> {
  static override type = 'load-balancer' as const
  componentType = 'load-balancer' as const
}
export class ServiceShapeUtil extends ComponentShapeUtil<TLShape<'service'>> {
  static override type = 'service' as const
  componentType = 'service' as const
}
export class CacheShapeUtil extends ComponentShapeUtil<TLShape<'cache'>> {
  static override type = 'cache' as const
  componentType = 'cache' as const
}
export class DatabaseShapeUtil extends ComponentShapeUtil<TLShape<'database'>> {
  static override type = 'database' as const
  componentType = 'database' as const
}
export class QueueShapeUtil extends ComponentShapeUtil<TLShape<'queue'>> {
  static override type = 'queue' as const
  componentType = 'queue' as const
}

/** Pass to `<Tldraw shapeUtils>`. One util per entry of `COMPONENT_TYPES`. */
export const componentShapeUtils = [
  ClientShapeUtil,
  CdnShapeUtil,
  LoadBalancerShapeUtil,
  ServiceShapeUtil,
  CacheShapeUtil,
  DatabaseShapeUtil,
  QueueShapeUtil
]
