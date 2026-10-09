import { useEffect, useState } from 'react'
import type { TopicMasterySummary } from '../../../shared/mastery'
import '../lesson/lesson.css'
import { OutsidePrimerBadge } from '../lesson/OutsidePrimerBadge'
import { errorMessage } from '../quiz/errorMessage'
import './mastery.css'
import { masteryLabels } from './masteryText'
import { TopicScreen } from './TopicScreen'

function TopicList({ onOpen }: { onOpen: (topic: TopicMasterySummary) => void }) {
  const [topics, setTopics] = useState<TopicMasterySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .listMasteryTopics()
      .then(setTopics)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }, [])

  if (error) return <p role="alert">Could not load the topics: {error}</p>
  if (!topics) return <p>Loading topics...</p>
  return (
    <ul className="lesson-topic-list" data-testid="mastery-topic-list">
      {topics.map((topic) => (
        <li key={topic.id}>
          <button type="button" onClick={() => onOpen(topic)} data-topic={topic.slug}>
            <span className="lesson-topic-title">{topic.title}</span>
            {!topic.grounded && <OutsidePrimerBadge />}
            <span className={`mastery-badge mastery-${topic.mastery}`}>
              {masteryLabels[topic.mastery]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Topic list with mastery, and the topic screen that drives the Mastery Loop. */
export function MasteryView({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState<TopicMasterySummary | null>(null)

  return (
    <main className="lesson-view" data-testid="mastery-view">
      <nav className="lesson-nav">
        {topic ? (
          <button type="button" onClick={() => setTopic(null)} data-testid="mastery-back">
            All topics
          </button>
        ) : (
          <button type="button" onClick={onClose}>
            Home
          </button>
        )}
        <h1>Learn</h1>
      </nav>
      {topic ? <TopicScreen key={topic.id} topic={topic} /> : <TopicList onOpen={setTopic} />}
    </main>
  )
}
