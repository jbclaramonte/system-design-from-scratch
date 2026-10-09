import { useEffect, useState } from 'react'
import type { TopicSummary } from '../../../shared/topic'
import { LessonScreen } from './LessonScreen'
import { OutsidePrimerBadge } from './OutsidePrimerBadge'
import './lesson.css'

function TopicList({ onOpen }: { onOpen: (topic: TopicSummary) => void }) {
  const [topics, setTopics] = useState<TopicSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .listTopics()
      .then(setTopics)
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  if (error) return <p role="alert">Could not load the topics: {error}</p>
  if (!topics) return <p>Loading topics...</p>
  return (
    <ul className="lesson-topic-list" data-testid="lesson-topic-list">
      {topics.map((topic) => (
        <li key={topic.id}>
          <button type="button" onClick={() => onOpen(topic)} data-topic={topic.slug}>
            <span className="lesson-topic-title">{topic.title}</span>
            {!topic.grounded && <OutsidePrimerBadge />}
            <span className="lesson-topic-meta">
              {topic.notionCount > 0 ? `${topic.notionCount} notions` : 'Not started'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Topic selector and Lesson screen. */
export function LessonView({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState<TopicSummary | null>(null)
  // Bumped by Retry: remounts the screen, which starts a new lesson request.
  const [attempt, setAttempt] = useState(0)

  return (
    <main className="lesson-view" data-testid="lesson-view">
      <nav className="lesson-nav">
        {topic ? (
          <button type="button" onClick={() => setTopic(null)} data-testid="lesson-back">
            All topics
          </button>
        ) : (
          <button type="button" onClick={onClose}>
            Home
          </button>
        )}
        <h1>Lessons</h1>
      </nav>
      {topic ? (
        <LessonScreen
          key={`${topic.id}:${attempt}`}
          topic={topic}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : (
        <TopicList onOpen={setTopic} />
      )}
    </main>
  )
}
