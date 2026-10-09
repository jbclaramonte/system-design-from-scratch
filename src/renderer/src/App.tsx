import { useEffect, useState } from 'react'
import type { PingResponse } from '../../shared/ipc'
import { DesignCanvasDevScreen } from './dev/DesignCanvasDevScreen'
import { GenerationDevPanel } from './dev/GenerationDevPanel'
import { LessonView } from './lesson/LessonView'
import { MasteryView } from './mastery/MasteryView'
import { QuizScreen } from './quiz/QuizScreen'
import { SettingsScreen } from './settings/SettingsScreen'

export function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [designCanvasOpen, setDesignCanvasOpen] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [lessonsOpen, setLessonsOpen] = useState(false)
  const [learnOpen, setLearnOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  if (learnOpen) {
    return <MasteryView onClose={() => setLearnOpen(false)} />
  }

  if (settingsOpen) {
    return <SettingsScreen onClose={() => setSettingsOpen(false)} />
  }

  if (import.meta.env.DEV && quizOpen) {
    return <QuizScreen onClose={() => setQuizOpen(false)} />
  }

  if (import.meta.env.DEV && lessonsOpen) {
    return <LessonView onClose={() => setLessonsOpen(false)} />
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
      <p>
        <button data-testid="open-learn" onClick={() => setLearnOpen(true)}>
          Learn
        </button>
      </p>
      <p>
        <button data-testid="open-settings" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </p>
      {import.meta.env.DEV && (
        <p>
          <button data-testid="open-lessons" onClick={() => setLessonsOpen(true)}>
            Lessons (dev)
          </button>{' '}
          <button data-testid="open-quiz" onClick={() => setQuizOpen(true)}>
            Quiz (dev)
          </button>
        </p>
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
