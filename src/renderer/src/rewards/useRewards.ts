import { useEffect, useState } from 'react'
import type { RewardsSummary } from '../../../shared/rewards'
import { errorMessage } from '../quiz/errorMessage'

/**
 * XP, Level and Badges, loaded on mount and again on every `path:changed` push (sent after a
 * completed Round). Derived by the main process from the history; nothing is stored here.
 */
export function useRewards(): { summary: RewardsSummary | null; error: string | null } {
  const [summary, setSummary] = useState<RewardsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    const load = () =>
      window.api
        .getRewards()
        .then((next) => current && setSummary(next))
        .catch((reason: unknown) => current && setError(errorMessage(reason)))
    void load()
    const unsubscribe = window.api.onLearningPathChanged(() => void load())
    return () => {
      current = false
      unsubscribe()
    }
  }, [])
  return { summary, error }
}
