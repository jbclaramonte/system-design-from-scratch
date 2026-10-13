/**
 * Undo and redo for the React Flow canvas: React Flow has none, so the editor keeps
 * snapshots of its state. Generic and immutable: it stores references, never copies, which is safe
 * because React Flow replaces nodes and edges instead of mutating them.
 */

export interface History<T> {
  past: readonly T[]
  future: readonly T[]
}

export const MAX_HISTORY = 100

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] }
}

/** Remember `present` before a change: it becomes the next undo step and clears the redo steps. */
export function record<T>(history: History<T>, present: T, limit = MAX_HISTORY): History<T> {
  return { past: [...history.past, present].slice(-limit), future: [] }
}

/** The state to restore and the new history, or `null` when there is nothing to undo. */
export function undo<T>(history: History<T>, present: T): { state: T; history: History<T> } | null {
  const state = history.past[history.past.length - 1]
  if (state === undefined) return null
  return {
    state,
    history: { past: history.past.slice(0, -1), future: [present, ...history.future] }
  }
}

export function redo<T>(history: History<T>, present: T): { state: T; history: History<T> } | null {
  const state = history.future[0]
  if (state === undefined) return null
  return {
    state,
    history: { past: [...history.past, present], future: history.future.slice(1) }
  }
}
