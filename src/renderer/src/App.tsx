import { useEffect, useState } from 'react'
import type { PingResponse } from '../../shared/ipc'
import type { TopicMasterySummary } from '../../shared/mastery'
import { AboutScreen } from './about/AboutScreen'
import { DashboardScreen } from './dashboard/DashboardScreen'
import { ProtocolDevScreen } from './design/protocol/ProtocolDevScreen'
import { ProtocolExerciseScreen } from './design/protocol/ProtocolExerciseScreen'
import { DesignCanvasDevScreen } from './dev/DesignCanvasDevScreen'
import { DiagramDevScreen } from './dev/DiagramDevScreen'
import { GenerationDevPanel } from './dev/GenerationDevPanel'
import { LessonView } from './lesson/LessonView'
import { MasteryView } from './mastery/MasteryView'
import { LearningPathScreen } from './path/LearningPathScreen'
import { PathTopicView } from './path/PathTopicView'
import { QuizScreen } from './quiz/QuizScreen'
import { OpenSettingsContext } from './settings/openSettings'
import { SettingsScreen } from './settings/SettingsScreen'
import { AppShell } from './shell/AppShell'
import { activeNavItem, screenLayout, type NavItemId, type Screen } from './shell/navigation'

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
          <button data-testid="open-diagrams-dev" onClick={() => open({ name: 'dev-diagrams' })}>
            Diagrams (dev)
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

/**
 * Every screen is rendered inside the `AppShell` (header, navigation, footer). Every screen can
 * open the Settings screen (the "Open Settings" button of auth errors).
 */
export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
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

  const openSettings = () =>
    setScreen((current) =>
      current.name === 'settings' ? current : { name: 'settings', back: current }
    )
  const navigate = (item: NavItemId) => {
    switch (item) {
      case 'learning-path':
        return setScreen({ name: 'home' })
      case 'dashboard':
        return setScreen({ name: 'dashboard' })
      case 'settings':
        // Keep the way back when Settings was opened from an error.
        return setScreen((current) =>
          current.name === 'settings' ? current : { name: 'settings' }
        )
      case 'about':
        return setScreen({ name: 'about' })
    }
  }

  return (
    <OpenSettingsContext.Provider value={openSettings}>
      <AppShell
        activeItem={activeNavItem(screen)}
        layout={screenLayout(screen)}
        version={version}
        scrollKey={screen.name === 'topic' ? `topic-${screen.topic.id}` : screen.name}
        onNavigate={navigate}
      >
        <AppScreen screen={screen} setScreen={setScreen} devInfo={{ version, ping, error }} />
      </AppShell>
    </OpenSettingsContext.Provider>
  )
}

function AppScreen({
  screen,
  setScreen,
  devInfo
}: {
  screen: Screen
  setScreen: (screen: Screen) => void
  devInfo: { version: string | null; ping: PingResponse | null; error: string | null }
}) {
  const home = () => setScreen({ name: 'home' })
  const openTopic = (topic: TopicMasterySummary) => setScreen({ name: 'topic', topic })
  const openExercise = (designExerciseId: number) =>
    setScreen({ name: 'exercise', designExerciseId })

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
      return <SettingsScreen onClose={() => setScreen(screen.back ?? { name: 'home' })} />
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
    case 'dev-diagrams':
      if (import.meta.env.DEV) return <DiagramDevScreen onClose={home} />
      break
  }

  return (
    <main>
      <LearningPathScreen onOpenTopic={openTopic} onOpenExercise={openExercise} />
      {import.meta.env.DEV && <DevSection open={setScreen} {...devInfo} />}
    </main>
  )
}
