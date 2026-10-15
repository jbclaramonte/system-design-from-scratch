import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { LessonQuestionContext } from '../../../../shared/lessonQuestion'
import { errorMessage } from '../../quiz/errorMessage'
import { createTextBuffer } from '../textBuffer'
import { emptyThread, exchangesBefore, isAnswering, threadReducer } from './lessonQuestion'

/**
 * The thread of a Lesson Question panel: asks, streams each answer into its exchange, cancels a
 * run on demand or when the panel goes away. The thread is in memory only: it goes with the
 * component, and `lessonQuestion:ask` stores nothing. Each run has its own request id, so a
 * cancelled run never reaches a later one.
 */
export function useLessonQuestions(context: LessonQuestionContext, lesson: string) {
  const [thread, dispatch] = useReducer(threadReducer, emptyThread)
  // What the callbacks need without changing identity: the latest thread and request inputs.
  const latest = useRef({ thread, context, lesson })
  useEffect(() => {
    latest.current = { thread, context, lesson }
  })
  /** Live requests by exchange id: how to stop listening and cancel. */
  const runs = useRef(new Map<string, { requestId: string; stop: () => void }>())

  const cancelRun = useCallback((id: string) => {
    const run = runs.current.get(id)
    if (run) void window.api.cancelLessonQuestion({ requestId: run.requestId })
  }, [])

  const start = useCallback((id: string, selection: string, question: string) => {
    const requestId = crypto.randomUUID()
    const buffer = createTextBuffer((text) =>
      dispatch({ type: 'answer', id, action: { type: 'text', text } })
    )
    let ended = false
    const stop = () => {
      unsubscribe()
      buffer.clear()
      runs.current.delete(id)
    }
    const unsubscribe = window.api.onLessonQuestionEvent(({ requestId: rid, event }) => {
      if (rid !== requestId) return
      if (event.type === 'text_delta') return buffer.push(event.text)
      if (event.type === 'retry') buffer.clear()
      else buffer.flush()
      dispatch({ type: 'answer', id, action: { type: 'event', event } })
      if (event.type === 'done' || event.type === 'error') {
        ended = true
        stop()
      }
    })
    runs.current.set(id, {
      requestId,
      stop: () => {
        if (!ended) void window.api.cancelLessonQuestion({ requestId })
        stop()
      }
    })
    const { thread: current, context: where, lesson: text } = latest.current
    window.api
      .askLessonQuestion({
        requestId,
        context: where,
        lesson: text,
        selection,
        question,
        thread: exchangesBefore(current, id)
      })
      .catch((reason: unknown) => {
        ended = true
        stop()
        dispatch({ type: 'refused', id, message: errorMessage(reason) })
      })
  }, [])

  const ask = useCallback(
    (selection: string, question: string) => {
      const id = crypto.randomUUID()
      dispatch({ type: 'ask', id, selection, question })
      // `latest` does not hold the new exchange yet: it is not part of its own thread anyway.
      start(id, selection, question)
    },
    [start]
  )

  const retry = useCallback(
    (id: string) => {
      const exchange = latest.current.thread.exchanges.find((e) => e.id === id)
      if (!exchange) return
      dispatch({ type: 'retry', id })
      start(id, exchange.selection, exchange.question)
    },
    [start]
  )

  // A run still going when the panel closes is cancelled; nothing is kept.
  useEffect(() => {
    const live = runs.current
    return () => {
      for (const run of [...live.values()]) run.stop()
    }
  }, [])

  return { thread, answering: isAnswering(thread), ask, retry, cancel: cancelRun }
}
