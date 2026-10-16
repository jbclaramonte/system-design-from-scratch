import { useEffect } from 'react'
import { useUpdates } from './UpdateProvider'
import './update.css'

/** How long "You are up to date" stays on screen; an error stays until it is closed. */
const INFO_MS = 8000

/**
 * The answer to "Check for updates..." in the application menu, in the banner slot: "You are up to
 * date (version X)", a readable error, or the note that the update banner waits for the end of a
 * Round or Design Exercise. An update found outside those screens shows the banner instead.
 */
export function UpdateCheckNotice() {
  const { checkNotice, dismissCheckNotice } = useUpdates()
  const timed = checkNotice?.transient === true

  useEffect(() => {
    if (!timed) return
    const timer = setTimeout(dismissCheckNotice, INFO_MS)
    return () => clearTimeout(timer)
  }, [timed, checkNotice, dismissCheckNotice])

  if (!checkNotice) return null
  const error = checkNotice.tone === 'error'

  return (
    <section className="update-notice" aria-label="Update check" data-testid="update-check-notice">
      <div className="update-banner-inner">
        <p
          className="update-notice-text"
          role={error ? 'alert' : 'status'}
          data-testid="update-check-notice-text"
        >
          {checkNotice.message}
        </p>
        <button
          type="button"
          className="btn-sm"
          data-testid="update-check-notice-close"
          onClick={dismissCheckNotice}
        >
          Close
        </button>
      </div>
    </section>
  )
}
