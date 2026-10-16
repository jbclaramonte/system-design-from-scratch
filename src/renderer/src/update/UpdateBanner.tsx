import { useUpdates } from './UpdateProvider'
import { availableMessage, progressLabel } from './updateText'
import './update.css'

/**
 * The App Update banner, between the header and the content: "Version X is available" with
 * "Install and restart" (macOS arm64, packaged app) or a link to the release page, "Not now"
 * (the version is remembered) and the release notes. It stays away from a Quiz round and a Design
 * Exercise (see `useHoldUpdateBanner`).
 */
export function UpdateBanner() {
  const { pending, bannerVisible, install, startInstall, dismiss } = useUpdates()
  if (!pending || !bannerVisible) return null

  const busy = install.name === 'running' || install.name === 'restarting'
  const canInstall = pending.install.canInstall
  // Where to read about it, or download it by hand after a failure.
  const releaseUrl = install.name === 'failed' ? install.manualUrl : pending.releaseUrl

  return (
    <section className="update-banner" aria-label="App update" data-testid="update-banner">
      <div className="update-banner-inner">
        {busy ? (
          <p
            className="update-banner-text status-strip"
            role="status"
            data-testid="update-progress"
          >
            <span className="spinner" aria-hidden="true" />
            <span className="status-strip-text">
              {progressLabel(
                install.name === 'running' ? install.progress : { phase: 'restarting' }
              )}
            </span>
          </p>
        ) : (
          <>
            <p className="update-banner-text" role="status">
              <strong>{availableMessage(pending)}</strong>{' '}
              <a href={pending.releaseUrl} target="_blank" rel="noreferrer">
                Release notes
              </a>
              {!canInstall && !pending.install.canInstall && (
                <span className="update-banner-reason"> {pending.install.reason}</span>
              )}
            </p>
            <div className="update-banner-actions">
              {canInstall ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  data-testid="update-install"
                  onClick={startInstall}
                >
                  Install and restart
                </button>
              ) : (
                <a
                  className="btn btn-sm"
                  href={releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="update-download"
                >
                  Open the release page
                </a>
              )}
              <button
                type="button"
                className="btn-sm"
                data-testid="update-dismiss"
                onClick={dismiss}
              >
                Not now
              </button>
            </div>
          </>
        )}
        {install.name === 'failed' && (
          <p
            role="alert"
            className="notice notice-error update-banner-error"
            data-testid="update-error"
          >
            {install.error.message} The installed app was not changed.{' '}
            <a href={install.manualUrl} target="_blank" rel="noreferrer">
              Download it manually
            </a>
            .
          </p>
        )}
      </div>
    </section>
  )
}
