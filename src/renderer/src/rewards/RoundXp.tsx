import { useEffect, useState } from 'react'
import type { RoundXp as RoundXpData } from '../../../shared/rewards'
import './rewards.css'
import { awardLine } from './rewardsText'

/**
 * The XP a completed Round paid, with the reason ("+30 XP: Round passed"), under its score. Shows
 * nothing while it loads, when the Round paid nothing or when it cannot be read: the results
 * stand without it.
 */
export function RoundXp({ roundId }: { roundId: number }) {
  const [xp, setXp] = useState<RoundXpData | null>(null)
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
  return (
    <section
      className="card round-xp"
      aria-labelledby="round-xp-title"
      data-testid="round-xp"
      data-total={xp.total}
    >
      <h3 id="round-xp-title" className="label-caps">
        XP earned
      </h3>
      <ul className="round-xp-list">
        {xp.awards.map((award) => (
          <li key={award.kind} data-testid="round-xp-line">
            {awardLine(award)}
          </li>
        ))}
      </ul>
      {xp.awards.length > 1 && (
        <p className="round-xp-total" data-testid="round-xp-total">
          +{xp.total} XP in total
        </p>
      )}
    </section>
  )
}
