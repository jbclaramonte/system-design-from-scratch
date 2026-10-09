import type { Database } from '../db'
import {
  createDesignExercise,
  getDesignScene,
  listDesignExercises,
  saveDesignScene
} from '../db/repositories/designPractice'
import type { DesignExerciseRef, IpcRequest, IpcResponse } from '../../shared/ipc'

/** Slug of the throwaway Design Exercise used by the dev Design Canvas screen. */
export const SCRATCH_DESIGN_EXERCISE_SLUG = 'dev-scratch'

function assertExerciseId(id: unknown): asserts id is number {
  if (!Number.isSafeInteger(id) || (id as number) <= 0) {
    throw new Error(`Invalid design exercise id: ${String(id)}`)
  }
}

function assertSnapshot(snapshot: unknown): void {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    throw new Error('A Design Scene snapshot must be a JSON object')
  }
}

export interface DesignIpc {
  loadScene(request: IpcRequest<'design:loadScene'>): IpcResponse<'design:loadScene'>
  saveScene(request: IpcRequest<'design:saveScene'>): void
  openScratchExercise(): DesignExerciseRef
}

/** Design Scene persistence over IPC. `allowScratch` is false in a packaged app. */
export function createDesignIpc(
  db: Database,
  { allowScratch }: { allowScratch: boolean }
): DesignIpc {
  return {
    loadScene({ designExerciseId }) {
      assertExerciseId(designExerciseId)
      return getDesignScene(db, designExerciseId)?.snapshot ?? null
    },
    saveScene({ designExerciseId, snapshot }) {
      assertExerciseId(designExerciseId)
      assertSnapshot(snapshot)
      saveDesignScene(db, designExerciseId, snapshot)
    },
    openScratchExercise() {
      if (!allowScratch) throw new Error('The scratch design exercise is only available in dev')
      const exercise =
        listDesignExercises(db).find(({ slug }) => slug === SCRATCH_DESIGN_EXERCISE_SLUG) ??
        createDesignExercise(db, {
          slug: SCRATCH_DESIGN_EXERCISE_SLUG,
          title: 'Scratch design (dev)',
          position: 0,
          grounded: false
        })
      return { id: exercise.id, slug: exercise.slug, title: exercise.title }
    }
  }
}
