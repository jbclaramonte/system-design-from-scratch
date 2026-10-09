import { useEffect, useState } from 'react'
import type { TopicStep } from '../../../shared/learningPath'
import type { TopicMasterySummary } from '../../../shared/mastery'
import '../lesson/lesson.css'
import '../mastery/mastery.css'
import { TopicScreen } from '../mastery/TopicScreen'
import { recommendedStep } from './pathText'

/**
 * A topic opened from the Learning Path: the Mastery Loop topic screen, with the way back to the
 * path. When a `path:changed` push shows the topic mastered, the next step is offered.
 */
export function PathTopicView({
  topic,
  onBack,
  onOpenTopic
}: {
  topic: TopicMasterySummary
  onBack: () => void
  onOpenTopic: (topic: TopicMasterySummary) => void
}) {
  const [unlocked, setUnlocked] = useState<TopicStep | null>(null)

  useEffect(
    () =>
      window.api.onLearningPathChanged((path) => {
        const own = path.steps.find((step) => step.key === `topic:${topic.slug}`)
        const next = recommendedStep(path)
        setUnlocked(
          own?.status === 'mastered' && next?.kind === 'topic' && next.topic.id !== topic.id
            ? next
            : null
        )
      }),
    [topic.id, topic.slug]
  )

  return (
    <main className="lesson-view" data-testid="path-topic-view">
      <nav className="lesson-nav">
        <button type="button" onClick={onBack} data-testid="path-back">
          Learning Path
        </button>
        <h1>{topic.title}</h1>
        {unlocked && (
          <p role="status" className="path-unlocked">
            Next step unlocked: {unlocked.topic.title}{' '}
            <button
              type="button"
              data-testid="path-open-next"
              onClick={() => onOpenTopic(unlocked.topic)}
            >
              Open
            </button>
          </p>
        )}
      </nav>
      <TopicScreen key={topic.id} topic={topic} />
    </main>
  )
}
