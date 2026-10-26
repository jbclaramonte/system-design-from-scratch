import { useEffect, useRef, useState } from 'react'
import type { RecallResult, RecallStart } from '../../../shared/recall'
import { RecallPlayer } from './RecallPlayer'
import { RecallResults } from './RecallResults'

type Phase =
  | { name: 'loading' }
  | { name: 'play'; start: RecallStart }
  | { name: 'results'; result: RecallResult }

/**
 * The Recall Quiz taken before the Lesson of a Topic opens. It never traps the learner: when
 * there is nothing to recall, or anything fails while loading, `onDone` runs right away and the
 * Lesson opens. Otherwise it plays the session (an open one is resumed), shows the results, and
 * `onDone` runs from "Continue to the Lesson".
 */
export function RecallGate({ topicId, onDone }: { topicId: number; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])
  // One request per topic, even when the effect runs twice (StrictMode).
  const request = useRef<{ topicId: number; promise: Promise<RecallStart | null> } | null>(null)

  useEffect(() => {
    if (request.current?.topicId !== topicId) {
      request.current = { topicId, promise: window.api.prepareRecallGate({ topicId }) }
    }
    let active = true
    request.current.promise
      .then((start) => {
        if (!active) return
        if (start) setPhase({ name: 'play', start })
        else onDoneRef.current()
      })
      .catch(() => {
        if (active) onDoneRef.current()
      })
    return () => {
      active = false
    }
  }, [topicId])

  if (phase.name === 'play') {
    return (
      <RecallPlayer
        key={phase.start.session.id}
        start={phase.start}
        onCompleted={(result) => setPhase({ name: 'results', result })}
        onGiveUp={onDone}
      />
    )
  }
  if (phase.name === 'results') {
    return <RecallResults result={phase.result} onContinue={onDone} />
  }
  // Loading: nothing to show for one round-trip; most Lessons have nothing to recall.
  return null
}
