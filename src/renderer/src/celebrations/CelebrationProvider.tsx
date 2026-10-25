import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  celebrationKey,
  whatToCelebrate,
  type Celebration,
  type RoundOnScreen
} from '../../../shared/celebrations'
import type { MarkCelebratedRequest, PendingCelebrations } from '../../../shared/rewards'
import { CelebrationCard } from './CelebrationCard'
import { celebrationAnnouncement } from './celebrationText'
import './celebrations.css'

type Unlock = Exclude<Celebration, { kind: 'round_xp' }>

/** How long a card stays, unless dismissed. It never waits for the learner. */
export const CELEBRATION_DURATION_MS = 7000

interface CelebrationContextValue {
  /** The "Celebrations" setting. */
  enabled: boolean
  /** Declares the Round whose screen is open (null: none). */
  setRound(round: RoundOnScreen | null): void
}

const CelebrationContext = createContext<CelebrationContextValue>({
  enabled: true,
  setRound: () => undefined
})

export const useCelebrationsEnabled = (): boolean => useContext(CelebrationContext).enabled

/**
 * Declares the Round on screen while the calling screen is mounted: `passed` null while it is
 * played, then true or false on its results. A failed or running Round holds the celebrations of
 * Badges and Levels until its screen is closed.
 */
export function useRoundOnScreen(passed: boolean | null): void {
  const { setRound } = useContext(CelebrationContext)
  useEffect(() => {
    setRound({ passed })
    return () => setRound(null)
  }, [setRound, passed])
}

const noPending: PendingCelebrations = { badges: [], level: null }

/** What to remember once the celebration with this key (`celebrationKey`) was shown. */
const requestOf = (key: string): MarkCelebratedRequest =>
  key.startsWith('badge:')
    ? { badgeIds: [key.slice('badge:'.length)], level: null }
    : { badgeIds: [], level: Number(key.slice('level:'.length)) }

/**
 * The Celebrations of a Badge earned or a Level reached (#66): a card that slides in at a corner,
 * one at a time, in order, never modal and gone by itself. What is shown comes from
 * `whatToCelebrate`; the main process remembers each Badge and Level once it was shown, so it
 * plays once. Reloads when a Round completes (`path:changed`) and when the learner changes screen
 * (`screenKey`), which covers Badges earned in the Design practice.
 *
 * Setting off: nothing is shown or announced, and what is pending is marked as celebrated so it
 * does not play later. A failure to read or save never reaches the learner.
 */
export function CelebrationProvider({
  screenKey,
  children
}: {
  screenKey: string
  children: ReactNode
}) {
  const [enabled, setEnabled] = useState(true)
  const [pending, setPending] = useState<PendingCelebrations>(noPending)
  const [round, setRound] = useState<RoundOnScreen | null>(null)
  // Keys of the cards that went away (dismissed or timed out): never queued again.
  const [gone, setGone] = useState<string[]>([])
  const loadRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    let current = true
    const load = () => {
      Promise.all([window.api.getSettings(), window.api.getCelebrations()])
        .then(([settings, next]) => {
          if (!current) return
          setEnabled(settings.celebrations)
          setPending(next)
        })
        .catch(() => undefined)
    }
    loadRef.current = load
    load()
    const unsubscribe = window.api.onLearningPathChanged(load)
    return () => {
      current = false
      unsubscribe()
    }
  }, [])

  // A new screen may follow work that earned something without a Round (a Design Exercise).
  const firstScreen = useRef(true)
  useEffect(() => {
    if (firstScreen.current) firstScreen.current = false
    else loadRef.current()
  }, [screenKey])

  const queue = useMemo(
    () =>
      whatToCelebrate({
        round,
        badges: pending.badges,
        level: pending.level,
        shown: gone
      }).filter((celebration): celebration is Unlock => celebration.kind !== 'round_xp'),
    [round, pending, gone]
  )
  // The card on screen is the head of the queue; it stays until it goes away.
  const active = enabled ? (queue[0] ?? null) : null
  const activeKey = active ? celebrationKey(active) : null
  const queueKeys = queue.map((celebration) => celebrationKey(celebration)!).join(' ')

  // Off: settle what is pending without showing it, then read again.
  useEffect(() => {
    if (enabled || queueKeys === '') return
    Promise.all(queueKeys.split(' ').map((key) => window.api.markCelebrated(requestOf(key))))
      .then(() => loadRef.current())
      .catch(() => undefined)
  }, [enabled, queueKeys])

  // Flag it as celebrated once it is on screen; a card stays for a while and never blocks.
  useEffect(() => {
    if (activeKey === null) return
    window.api.markCelebrated(requestOf(activeKey)).catch(() => undefined)
    const timer = setTimeout(() => setGone((keys) => [...keys, activeKey]), CELEBRATION_DURATION_MS)
    return () => clearTimeout(timer)
  }, [activeKey])

  const value = useMemo(() => ({ enabled, setRound }), [enabled])

  return (
    <CelebrationContext.Provider value={value}>
      {children}
      {/* Always mounted so a change of its text is announced, politely. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
        data-testid="celebration-live"
      >
        {active ? celebrationAnnouncement(active) : ''}
      </div>
      {active && activeKey && (
        <CelebrationCard
          key={activeKey}
          celebration={active}
          onDismiss={() => setGone((keys) => [...keys, activeKey])}
        />
      )}
    </CelebrationContext.Provider>
  )
}
