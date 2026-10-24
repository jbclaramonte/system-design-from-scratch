import './rewards.css'
import { BadgeIcon, LockGlyph } from './BadgeIcon'
import { badgeDescription, badgesSummary, badgeStatusLabel } from './rewardsText'
import { useRewards } from './useRewards'

/**
 * The Badges of the Dashboard: each with its icon, its status in words (the date it was earned, or
 * Locked) and its unlock rule, so a locked Badge says how to get it. A locked Badge is neutral,
 * never red.
 */
export function BadgesSection() {
  const { summary, error } = useRewards()
  if (error) {
    return (
      <p className="muted" role="status">
        Badges unavailable: {error}
      </p>
    )
  }
  if (!summary) return null
  return (
    <section className="dash-section" aria-labelledby="dash-badges" data-testid="badges-section">
      <h2 id="dash-badges">Badges</h2>
      <p className="dash-note" data-testid="badges-summary">
        {badgesSummary(summary.badges)}. They reward mastery: a passed Round, a mastered Topic, a
        completed Design Exercise.
      </p>
      <ul className="badges">
        {summary.badges.map((badge) => (
          <li
            key={badge.id}
            className={`card badge badge-${badge.earned ? 'earned' : 'locked'}`}
            data-testid="badge-card"
            data-badge={badge.id}
            data-earned={String(badge.earned)}
          >
            <span className="visually-hidden">{badgeDescription(badge)}</span>
            <span
              className={`icon-tile icon-tile-${badge.earned ? 'mastered' : 'neutral'}`}
              aria-hidden="true"
            >
              <BadgeIcon name={badge.icon} />
            </span>
            <div className="badge-text" aria-hidden="true">
              <p className="badge-title">{badge.title}</p>
              <p className="badge-rule">{badge.rule}</p>
              <p className="badge-status">
                <span className={`chip chip-dot${badge.earned ? ' chip-mastered' : ''}`}>
                  {!badge.earned && <LockGlyph />}
                  {badgeStatusLabel(badge)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
