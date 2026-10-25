import type { LearningPathStepStatus } from '../../../shared/learningPath'
import type { ReactNode } from 'react'
import {
  nodeTone,
  sectionStateLabels,
  type NodeView,
  type PathStripView,
  type SectionState
} from './pathView'

const svgProps = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

/** The glyph of a node's tile: stacked pages for a topic, a blueprint sheet for an exercise. Decorative. */
export function NodeGlyph({ kind }: { kind: NodeView['kind'] }) {
  return (
    <svg {...svgProps}>
      {kind === 'topic' ? (
        <path d="M6 5h12v14H6zM9 9h6M9 12h6M9 15h3" />
      ) : (
        <path d="M5 5h14v14H5zM5 10h14M10 5v14" />
      )}
    </svg>
  )
}

/** The glyph of a section header. Decorative. */
export function SectionGlyph() {
  return (
    <svg {...svgProps}>
      <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />
    </svg>
  )
}

/**
 * The mark on the corner of a tile: a circle with a glyph per status (check, dot, bar, lock), so
 * the status never relies on color alone. Decorative: the status is also written in words.
 */
export function NodeMark({ status }: { status: LearningPathStepStatus }) {
  const tone = nodeTone[status]
  return (
    <span className={`path-node-mark status-mark status-mark-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
        <circle cx="10" cy="10" r="9" className="status-mark-ring" />
        {(status === 'mastered' || status === 'completed') && (
          <path d="M6 10.5l2.8 2.8L14 7.5" className="status-mark-glyph" />
        )}
        {status === 'in_progress' && <circle cx="10" cy="10" r="3" className="status-mark-dot" />}
        {status === 'available' && <path d="M8.5 6.5l5 3.5-5 3.5z" className="status-mark-glyph" />}
        {(status === 'limit_reached' || status === 'skipped') && (
          <path d="M10 6v5M10 13.4v.1" className="status-mark-glyph" />
        )}
        {(status === 'locked' || status === 'coming_soon') && (
          <path d="M7.5 9V7.7a2.5 2.5 0 015 0V9M7 9h6v4.5H7z" className="status-mark-glyph" />
        )}
      </svg>
    </span>
  )
}

/**
 * What a node shows: the tile with its mark, "Step 03 · In progress, Round 2", the title (it
 * wraps, never cut), a detail line and the action. The status line sits above the title and the
 * chips below it, so nothing overlaps the title. The caller wraps it in the node's one control.
 */
export function NodeFace({ node, children }: { node: NodeView; children?: ReactNode }) {
  return (
    <>
      <span className={`icon-tile icon-tile-${node.tone} path-node-tile`} aria-hidden="true">
        <NodeGlyph kind={node.kind} />
        <NodeMark status={node.status} />
      </span>
      <span className="path-node-body">
        <span className="path-node-eyebrow label-mono">
          <span>{node.stepLabel}</span>
          <span aria-hidden="true">·</span>
          <span
            className={`path-node-status path-node-status-${node.tone}`}
            data-testid="path-status"
          >
            {node.statusLabel}
          </span>
        </span>
        <span className="path-node-title">{node.title}</span>
        {node.detail && <span className="path-node-detail">{node.detail}</span>}
        {children}
      </span>
      {node.action && (
        <span
          className={`path-node-action${node.current ? ' btn btn-primary' : ''}`}
          aria-hidden="true"
        >
          {node.action}
        </span>
      )}
    </>
  )
}

/** The header strip: global progress and the next milestone. */
export function PathStrip({ strip }: { strip: PathStripView }) {
  const { progress, nextMilestone } = strip
  return (
    <div className="path-strip" role="group" aria-label="Progress and next milestone">
      <div className="path-strip-item" data-testid="path-strip-progress">
        <span className="path-strip-label label-caps">Global progress</span>
        <span className="path-strip-value" data-testid="path-progress-text">
          <strong>{progress.mastered}</strong>
          <span className="path-strip-total"> / {progress.total}</span>
          <span className="path-strip-unit"> topics mastered ({progress.percent}%)</span>
        </span>
        <span
          className={`progress path-strip-bar${progress.percent === 100 ? ' progress-complete' : ''}`}
          role="progressbar"
          aria-label={progress.text}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
        >
          <span className="progress-fill" style={{ width: `${progress.percent}%` }} />
        </span>
      </div>
      <div className="path-strip-item" data-testid="path-strip-next">
        <span className="path-strip-label label-caps">Next milestone</span>
        {nextMilestone.step ? (
          <span className="path-strip-value path-strip-next">
            {nextMilestone.text}
            <span className="path-strip-unit">
              {' '}
              ({nextMilestone.step.action ?? nextMilestone.step.statusLabel})
            </span>
          </span>
        ) : (
          <span className="path-strip-value path-strip-next" data-testid="path-no-next">
            {nextMilestone.text}
          </span>
        )}
      </div>
    </div>
  )
}

/** The chip saying how far a section is, with a glyph so it is not color alone. */
export function SectionStateChip({ state }: { state: SectionState }) {
  const variant =
    state === 'complete' ? 'chip-mastered' : state === 'in_progress' ? 'chip-progress' : ''
  return (
    <span className={`chip chip-dot ${variant}`.trim()} data-testid="path-section-state">
      {sectionStateLabels[state]}
    </span>
  )
}
