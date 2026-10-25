import { useEffect, useState, type CSSProperties } from 'react'
import { whatToCelebrate } from '../../../shared/celebrations'
import type { RoundXp as RoundXpData } from '../../../shared/rewards'
import { useCelebrationsEnabled } from '../celebrations/CelebrationProvider'
import '../celebrations/celebrations.css'
import './rewards.css'
import { awardLine } from './rewardsText'

/**
 * The XP a completed Round paid, with the reason ("+30 XP: Round passed"), under its score. Shows
 * nothing while it loads, when the Round paid nothing or when it cannot be read: the results
 * stand without it.
 *
 * A passed Round celebrates (#66): the total ticks up and the card glows, in CSS only. The words
 * and the figures are the same without the animation (reduced motion, Celebrations off).
 */
export function RoundXp({ roundId, passed }: { roundId: number; passed: boolean }) {
  const [xp, setXp] = useState<RoundXpData | null>(null)
  const enabled = useCelebrationsEnabled()
  useEffect(() => {
    let current = true
    window.api
      .getRoundXp({ roundId })
      .then((next) => current && setXp(next))
      .catch(() => current && setXp(null))
    return () => {
      current = false
    }
  }, [roundId])
  if (!xp || xp.awards.length === 0) return null
  const celebrate =
    enabled && whatToCelebrate({ round: { passed, xp }, badges: [], level: null }).length > 0
  return (
    <section
      className={`card round-xp${celebrate ? ' round-xp-celebrate' : ''}`}
      aria-labelledby="round-xp-title"
      data-testid="round-xp"
      data-total={xp.total}
      data-celebrating={String(celebrate)}
    >
      <h3 id="round-xp-title" className="label-caps">
        XP earned
      </h3>
      {celebrate && (
        <p className="round-xp-ticker" data-testid="round-xp-ticker">
          +
          <span
            className="xp-count"
            aria-hidden="true"
            style={{ '--xp-total': xp.total } as CSSProperties}
          />
          <span className="visually-hidden">{xp.total}</span> XP
        </p>
      )}
      <ul className="round-xp-list">
        {xp.awards.map((award) => (
          <li key={award.kind} data-testid="round-xp-line">
            {awardLine(award)}
          </li>
        ))}
      </ul>
      {!celebrate && xp.awards.length > 1 && (
        <p className="round-xp-total" data-testid="round-xp-total">
          +{xp.total} XP in total
        </p>
      )}
    </section>
  )
}
