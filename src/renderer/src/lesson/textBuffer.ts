/** Timer functions, injectable so tests drive time. */
export interface Scheduler {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const timers: Scheduler = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

export interface TextBuffer {
  /** Appends a streamed chunk; it is delivered with the others at the next flush. */
  push(text: string): void
  /** Delivers what is pending now (before a terminal event, for example). */
  flush(): void
  /** Drops what is pending (the Generation restarts after a `retry`). */
  clear(): void
}

/**
 * Batches streamed text deltas so the lesson re-renders at most once per `intervalMs` instead
 * of once per token.
 */
export function createTextBuffer(
  onFlush: (text: string) => void,
  intervalMs = 80,
  scheduler: Scheduler = timers
): TextBuffer {
  let pending = ''
  let handle: unknown = null

  const cancelTimer = () => {
    if (handle !== null) scheduler.clear(handle)
    handle = null
  }

  const flush = () => {
    cancelTimer()
    if (!pending) return
    const text = pending
    pending = ''
    onFlush(text)
  }

  return {
    push(text) {
      pending += text
      if (handle === null) handle = scheduler.set(flush, intervalMs)
    },
    flush,
    clear() {
      cancelTimer()
      pending = ''
    }
  }
}

/** Distance (px) from the bottom under which the view keeps following the stream. */
export const FOLLOW_THRESHOLD_PX = 48

/** True when a scroll container is scrolled to (or near) its bottom. */
export function isNearBottom(
  {
    scrollTop,
    scrollHeight,
    clientHeight
  }: Pick<Element, 'scrollTop' | 'scrollHeight' | 'clientHeight'>,
  threshold = FOLLOW_THRESHOLD_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold
}
