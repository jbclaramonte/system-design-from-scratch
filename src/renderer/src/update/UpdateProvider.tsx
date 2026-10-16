import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type {
  UpdateCheckResult,
  UpdateErrorInfo,
  UpdateInfo,
  UpdateProgress
} from '../../../shared/update'
import { errorMessage } from '../quiz/errorMessage'
import { isBannerVisible } from './updateText'

/** Where an install is: idle, running (with its progress), restarting, or failed. */
export type InstallState =
  | { name: 'idle' }
  | { name: 'running'; progress: UpdateProgress | null }
  | { name: 'restarting' }
  | { name: 'failed'; error: UpdateErrorInfo; manualUrl: string }

interface Updates {
  /** The update to announce (found, newer, not dismissed), or null. */
  pending: UpdateInfo | null
  /** Whether the banner is shown: not while a Quiz round or a Design Exercise is open. */
  bannerVisible: boolean
  install: InstallState
  startInstall: () => void
  dismiss: () => void
  /** The "Check for updates" button. */
  checkNow: () => Promise<UpdateCheckResult>
  /** Registers a screen that must not be interrupted; returns the release function. */
  holdBanner: () => () => void
}

const noop = () => () => {}
const UpdatesContext = createContext<Updates>({
  pending: null,
  bannerVisible: false,
  install: { name: 'idle' },
  startInstall: () => {},
  dismiss: () => {},
  checkNow: () => Promise.resolve({ status: 'upToDate', currentVersion: '' }),
  holdBanner: noop
})

export const useUpdates = () => useContext(UpdatesContext)

/**
 * Keeps the update banner away while the calling component is mounted (or `active`): a Quiz round
 * or a Design Exercise must never be interrupted by an install prompt. The banner returns, with
 * its "Install and restart" button, once the learner leaves.
 */
export function useHoldUpdateBanner(active = true): void {
  const { holdBanner } = useUpdates()
  useEffect(() => (active ? holdBanner() : undefined), [active, holdBanner])
}

/** Holds the App Update state: the pending update, the banner's visibility and the install. */
export function UpdateProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<UpdateInfo | null>(null)
  const [holds, setHolds] = useState(0)
  const [install, setInstall] = useState<InstallState>({ name: 'idle' })

  useEffect(() => {
    // The launch check may have finished before this mounted: ask, then listen.
    window.api
      .getPendingUpdate()
      .then(setPending)
      .catch(() => {})
    return window.api.onUpdateAvailable(setPending)
  }, [])

  useEffect(
    () =>
      window.api.onUpdateProgress((progress) =>
        setInstall((current) =>
          current.name === 'running' ? { name: 'running', progress } : current
        )
      ),
    []
  )

  const holdBanner = useCallback(() => {
    setHolds((count) => count + 1)
    return () => setHolds((count) => count - 1)
  }, [])

  const startInstall = useCallback(() => {
    if (!pending || install.name === 'running') return
    setInstall({ name: 'running', progress: null })
    window.api
      .installUpdate({ version: pending.version })
      .then((result) =>
        setInstall(
          result.ok
            ? { name: 'restarting' }
            : { name: 'failed', error: result.error, manualUrl: result.manualUrl }
        )
      )
      .catch((reason: unknown) =>
        setInstall({
          name: 'failed',
          error: { code: 'unknown', message: errorMessage(reason) },
          manualUrl: pending.releaseUrl
        })
      )
  }, [pending, install.name])

  const dismiss = useCallback(() => {
    if (!pending) return
    void window.api.dismissUpdate({ version: pending.version }).catch(() => {})
    setPending(null)
    setInstall({ name: 'idle' })
  }, [pending])

  const checkNow = useCallback(async () => {
    const result = await window.api.checkForUpdate()
    if (result.status === 'available') {
      setPending(result.update)
      setInstall({ name: 'idle' })
    }
    return result
  }, [])

  const value = useMemo<Updates>(
    () => ({
      pending,
      bannerVisible: isBannerVisible({
        hasPending: pending !== null,
        holds,
        installing: install.name !== 'idle'
      }),
      install,
      startInstall,
      dismiss,
      checkNow,
      holdBanner
    }),
    [pending, holds, install, startInstall, dismiss, checkNow, holdBanner]
  )

  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>
}
