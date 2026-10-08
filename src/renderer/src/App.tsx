import { useEffect, useState } from 'react'
import type { PingResponse } from '../../shared/ipc'

export function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([window.api.getAppVersion(), window.api.ping({ message: 'hello' })])
      .then(([appVersion, pingResponse]) => {
        setVersion(appVersion)
        setPing(pingResponse)
      })
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

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
    </main>
  )
}
