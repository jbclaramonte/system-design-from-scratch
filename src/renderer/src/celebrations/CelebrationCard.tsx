import type { Celebration } from '../../../shared/celebrations'
import { BadgeIcon, LevelGlyph } from '../rewards/BadgeIcon'
import { celebrationDetail, celebrationLabel, celebrationTitle } from './celebrationText'
import './celebrations.css'

/**
 * A Badge earned or a Level reached, in a card at the bottom corner: slides in, a soft glow, no
 * sound. Words carry the whole message (the animation only adds to it), so with reduced motion it
 * is the same card, still. It is not modal: nothing behind it is blocked, and it can be dismissed.
 */
export function CelebrationCard({
  celebration,
  onDismiss
}: {
  celebration: Exclude<Celebration, { kind: 'round_xp' }>
  onDismiss: () => void
}) {
  const tone = celebration.kind === 'badge' ? 'mastered' : 'progress'
  return (
    <aside
      className={`card card-elevated celebration celebration-${tone}`}
      data-testid="celebration"
      data-kind={celebration.kind}
      aria-label={celebrationLabel(celebration)}
    >
      <span className={`icon-tile icon-tile-${tone}`} aria-hidden="true">
        {celebration.kind === 'badge' ? (
          <BadgeIcon name={celebration.badge.icon} />
        ) : (
          <LevelGlyph />
        )}
      </span>
      <div className="celebration-text">
        <p className="label-caps">{celebrationLabel(celebration)}</p>
        <p className="celebration-title" data-testid="celebration-title">
          {celebrationTitle(celebration)}
        </p>
        <p className="celebration-detail">{celebrationDetail(celebration)}</p>
      </div>
      <button
        type="button"
        className="celebration-dismiss"
        data-testid="celebration-dismiss"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </aside>
  )
}
