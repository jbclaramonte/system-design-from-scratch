import type { TLEditorSnapshot } from 'tldraw'
import type { Json } from '../../../shared/json'

/**
 * A Design Scene is stored as the tldraw editor snapshot (`getSnapshot(editor.store)`), as JSON.
 * These helpers are the only place that converts between the two.
 */

/** Plain JSON copy of a snapshot, safe to send over IPC and store (drops `undefined` fields). */
export function serializeScene(snapshot: TLEditorSnapshot): Json {
  return JSON.parse(JSON.stringify(snapshot)) as Json
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Snapshot to restore from a stored Design Scene, or `undefined` when the exercise has no scene
 * yet. Throws on a value that is not a tldraw snapshot, so the caller does not open (and then
 * autosave over) an empty canvas.
 */
export function deserializeScene(stored: Json | null): TLEditorSnapshot | undefined {
  if (stored === null) return undefined
  if (
    !isObject(stored) ||
    !isObject(stored['document']) ||
    !isObject(stored['document']['store']) ||
    !isObject(stored['document']['schema'])
  ) {
    throw new Error('Stored Design Scene is not a tldraw snapshot')
  }
  return stored as unknown as TLEditorSnapshot
}
