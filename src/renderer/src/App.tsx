import { useEffect, useState } from 'react'
import type { PingResponse } from '../../shared/ipc'
import type { TopicMasterySummary } from '../../shared/mastery'
import { AboutScreen } from './about/AboutScreen'
import './app.css'
import { DashboardScreen } from './dashboard/DashboardScreen'
import { ProtocolDevScreen } from './design/protocol/ProtocolDevScreen'
import { ProtocolExerciseScreen } from './design/protocol/ProtocolExerciseScreen'
import { DesignCanvasDevScreen } from './dev/DesignCanvasDevScreen'
import { GenerationDevPanel } from './dev/GenerationDevPanel'
import { LessonView } from './lesson/LessonView'
import { MasteryView } from './mastery/MasteryView'
import { LearningPathScreen } from './path/LearningPathScreen'
import { PathTopicView } from './path/PathTopicView'
import { QuizScreen } from './quiz/QuizScreen'
import { SettingsScreen } from './settings/SettingsScreen'

/**
 * The screens of the app. The Learning Path (`home`) is the main screen; every other screen
 * returns to it. To add a screen: add it here, render it in `App`, open it from the header nav.
 */
type Screen =
  | { name: 'home' }
  /** `from`: the screen the back button returns to (the Learning Path by default). */
  | { name: 'topic'; topic: TopicMasterySummary; from?: 'dashboard' }
  | { name: 'dashboard' }
  | { name: 'exercise'; designExerciseId: number }
  | { name: 'settings' }
  | { name: 'about' }
  // Dev builds only:
  | { name: 'dev-topics' }
  | { name: 'dev-lessons' }
  | { name: 'dev-quiz' }
  | { name: 'dev-design-canvas' }
  | { name: 'dev-design-exercise' }

/** Dev-only tools, in a compact section under the Learning Path. */
function DevSection({
  open,
  version,
  ping,
  error
}: {
  open: (screen: Screen) => void
  version: string | null
  ping: PingResponse | null
  error: string | null
}) {
  return (
    <section className="app-dev" aria-label="Developer tools">
      <details>
        <summary>Developer tools</summary>
        <div className="app-dev-tools">
          <button data-testid="open-topics-dev" onClick={() => open({ name: 'dev-topics' })}>
            All topics (dev)
          </button>
          <button data-testid="open-lessons" onClick={() => open({ name: 'dev-lessons' })}>
            Lessons (dev)
          </button>
          <button data-testid="open-quiz" onClick={() => open({ name: 'dev-quiz' })}>
            Quiz (dev)
          </button>
          <button
            data-testid="open-design-canvas-dev"
            onClick={() => open({ name: 'dev-design-canvas' })}
          >
            Design canvas (dev)
          </button>
          <button
            data-testid="open-design-exercise-dev"
            onClick={() => open({ name: 'dev-design-exercise' })}
          >
            Design exercise (dev)
          </button>
        </div>
        {error ? (
          <p role="alert">IPC error: {error}</p>
        ) : (
          <p data-testid="ping">
            Version {version ?? '...'} · ping {ping ? `${ping.reply} (${ping.receivedAt})` : '...'}
          </p>
        )}
        <GenerationDevPanel />
      </details>
    </section>
  )
}

export function App() {
  const [version, setVersion] = useState<string | null>(null)
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const home = () => setScreen({ name: 'home' })
  const openTopic = (topic: TopicMasterySummary) => setScreen({ name: 'topic', topic })
  const openExercise = (designExerciseId: number) =>
    setScreen({ name: 'exercise', designExerciseId })

  useEffect(() => {
    Promise.all([window.api.getAppVersion(), window.api.ping({ message: 'hello' })])
      .then(([appVersion, pingResponse]) => {
        setVersion(appVersion)
        setPing(pingResponse)
      })
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  switch (screen.name) {
    case 'topic':
      return (
        <PathTopicView
          key={screen.topic.id}
          topic={screen.topic}
          onBack={screen.from === 'dashboard' ? () => setScreen({ name: 'dashboard' }) : home}
          backLabel={screen.from === 'dashboard' ? 'Dashboard' : undefined}
          onOpenTopic={openTopic}
        />
      )
    case 'dashboard':
      return (
        <DashboardScreen
          onClose={home}
          onOpenTopic={(topic) => setScreen({ name: 'topic', topic, from: 'dashboard' })}
        />
      )
    case 'exercise':
      return (
        <ProtocolExerciseScreen
          key={screen.designExerciseId}
          designExerciseId={screen.designExerciseId}
          onClose={home}
        />
      )
    case 'settings':
      return <SettingsScreen onClose={home} />
    case 'about':
      return <AboutScreen onClose={home} />
    case 'dev-topics':
      if (import.meta.env.DEV) return <MasteryView onClose={home} />
      break
    case 'dev-lessons':
      if (import.meta.env.DEV) return <LessonView onClose={home} />
      break
    case 'dev-quiz':
      if (import.meta.env.DEV) return <QuizScreen onClose={home} />
      break
    case 'dev-design-canvas':
      if (import.meta.env.DEV) return <DesignCanvasDevScreen onClose={home} />
      break
    case 'dev-design-exercise':
      if (import.meta.env.DEV) return <ProtocolDevScreen onClose={home} />
      break
  }

  return (
    <main className="app-home">
      <header className="app-header">
        <h1>System Design from Scratch</h1>
        <nav aria-label="App">
          <button data-testid="open-dashboard" onClick={() => setScreen({ name: 'dashboard' })}>
            Dashboard
          </button>
          <button data-testid="open-settings" onClick={() => setScreen({ name: 'settings' })}>
            Settings
          </button>
          <button data-testid="open-about" onClick={() => setScreen({ name: 'about' })}>
            About
          </button>
        </nav>
      </header>
      <LearningPathScreen onOpenTopic={openTopic} onOpenExercise={openExercise} />
      {import.meta.env.DEV && (
        <DevSection open={setScreen} version={version} ping={ping} error={error} />
      )}
      <footer className="app-footer" data-testid="app-version">
        Version {version ?? '...'}
      </footer>
    </main>
  )
}
