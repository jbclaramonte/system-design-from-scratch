import type { Json } from '../../../shared/json'
import { InvalidSceneError, deserializeScene, type Scene } from './flow/scene'
import {
  convertTldrawSnapshot,
  isLegacyTldrawSnapshot,
  LegacySceneError
} from './legacy/tldrawScene'

/**
 * What the Design Canvas finds in `design_scenes.snapshot` when it opens an exercise.
 *
 * - `empty`: nothing stored yet.
 * - `scene`: a scene of the current format.
 * - `converted`: a scene stored by the tldraw canvas, converted in memory. The stored value is
 *   **not** touched: it is replaced by the normal autosave after the learner's first edit.
 * - `legacy`: a tldraw scene that cannot be converted. The canvas explains it and offers to start
 *   over (an explicit action); the stored value stays as it is until then.
 *
 * Any other value is not a Design Scene at all and throws an `InvalidSceneError`: an error is
 * shown, no canvas is mounted, and the autosave cannot overwrite the data.
 */
export type StoredScene =
  | { status: 'empty' }
  | { status: 'scene'; scene: Scene }
  | { status: 'converted'; scene: Scene; warnings: string[] }
  | { status: 'legacy'; reason: string }

export function readStoredScene(stored: Json | null): StoredScene {
  if (stored === null) return { status: 'empty' }
  if (isLegacyTldrawSnapshot(stored)) {
    try {
      const { scene, warnings } = convertTldrawSnapshot(stored)
      return { status: 'converted', scene, warnings }
    } catch (reason) {
      if (reason instanceof LegacySceneError) return { status: 'legacy', reason: reason.message }
      throw reason
    }
  }
  const scene = deserializeScene(stored)
  if (!scene) throw new InvalidSceneError('Stored Design Scene is empty')
  return { status: 'scene', scene }
}
