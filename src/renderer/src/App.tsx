import { useEffect, useState } from 'react'
import type { PingResponse } from '../../shared/ipc'
import { DesignCanvasDevScreen } from './dev/DesignCanvasDevScreen'
import { GenerationDevPanel } from './dev/GenerationDevPanel'

export function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [designCanvasOpen, setDesignCanvasOpen] = useState(false)

  useEffect(() => {
    Promise.all([window.api.getAppVersion(), window.api.ping({ message: 'hello' })])
      .then(([appVersion, pingResponse]) => {
        setVersion(appVersion)
        setPing(pingResponse)
      })
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  if (import.meta.env.DEV && designCanvasOpen) {
    return <DesignCanvasDevScreen onClose={() => setDesignCanvasOpen(false)} />
  }

  return (
    <main>
      <h1>System Design from Scratch</h1>
      {error ? (
        <p role="alert">IPC error: {error}</p>
      ) : (
        <dl>
          <dt>App version</dt>
          <dd data-testid="app-version">{version ?? '...'}</dd>
          <dt>Ping</dt>
          <dd data-testid="ping">{ping ? `${ping.reply} (${ping.receivedAt})` : '...'}</dd>
        </dl>
      )}
      {import.meta.env.DEV && (
        <p>
          <button data-testid="open-design-canvas-dev" onClick={() => setDesignCanvasOpen(true)}>
            Design canvas (dev)
          </button>
        </p>
      )}
      {import.meta.env.DEV && <GenerationDevPanel />}
    </main>
  )
}
