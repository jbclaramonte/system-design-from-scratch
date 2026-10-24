import './rewards.css'
import { levelLabel, levelProgressText, levelValueText, formatXp } from './rewardsText'
import { useRewards } from './useRewards'

/**
 * Level and XP with the progress to the next Level. `side`: a compact card (the Learning Path
 * side panel). `wide`: one row (the Dashboard overview).
 */
export function LevelCard({ variant = 'side' }: { variant?: 'side' | 'wide' }) {
  const { summary, error } = useRewards()
  if (error) {
    return (
      <p className="muted" role="status" data-testid="level-error">
        Level unavailable: {error}
      </p>
    )
  }
  if (!summary) return null
  const { level } = summary
  return (
    <section
      className={`card card-elevated level level-${variant}`}
      aria-labelledby={`level-title-${variant}`}
      data-testid="level-card"
    >
      <div className="level-head">
        <h2 id={`level-title-${variant}`} className="label-caps">
          Level
        </h2>
        <p className="level-figure" data-testid="level-name">
          <strong className="level-number">{levelLabel(level)}</strong>
          <span className="level-name">{level.name}</span>
        </p>
      </div>
      <div className="level-progress">
        <p className="level-xp" data-testid="level-xp">
          {formatXp(level.xp)}
        </p>
        <div
          className={`progress${level.xpToNext === null ? ' progress-complete' : ''}`}
          role="progressbar"
          aria-label="Progress to the next Level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level.percent}
          aria-valuetext={levelValueText(level)}
        >
          <div className="progress-fill" style={{ width: `${level.percent}%` }} />
        </div>
        <p className="level-detail" data-testid="level-progress-text">
          {levelProgressText(level)}
        </p>
      </div>
    </section>
  )
}
