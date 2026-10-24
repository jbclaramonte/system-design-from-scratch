import { useEffect, useState, type ReactNode } from 'react'
import type { FirstRunState } from '../../../shared/firstRun'
import { FirstRunScreen } from './FirstRunScreen'

/**
 * Shows the first-run screen instead of the app until the Generation Language is chosen. While
 * the state loads nothing is drawn (no flash of the Learning Path). If it cannot be read, the app
 * opens as it did before the question existed, in the default language.
 */
export function FirstRunGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FirstRunState | 'unreadable' | null>(null)
  const [chosen, setChosen] = useState(false)

  useEffect(() => {
    window.api
      .getFirstRun()
      .then(setState)
      .catch(() => setState('unreadable'))
  }, [])

  if (state === null) return null
  if (state === 'unreadable' || state.languageChosen || chosen) return <>{children}</>
  return (
    <FirstRunScreen suggestedLanguage={state.suggestedLanguage} onChosen={() => setChosen(true)} />
  )
}
