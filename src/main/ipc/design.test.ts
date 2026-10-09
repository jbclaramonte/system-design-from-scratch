import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { createDesignExercise } from '../db/repositories/designPractice'
import type { DesignGraph } from '../../shared/designGraph'
import { createDesignIpc, SCRATCH_DESIGN_EXERCISE_SLUG } from './design'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

function seedExercise(): number {
  return createDesignExercise(db, {
    slug: 'pastebin',
    title: 'Pastebin',
    position: 0,
    grounded: false
  }).id
}

const snapshot = { document: { store: {}, schema: { schemaVersion: 2 } }, session: {} }

describe('createDesignIpc', () => {
  it('returns null for an exercise without a Design Scene', () => {
    const design = createDesignIpc(db, { allowScratch: false })

    expect(design.loadScene({ designExerciseId: seedExercise() })).toBeNull()
  })

  it('saves a snapshot and loads it back, overwriting the previous one', () => {
    const design = createDesignIpc(db, { allowScratch: false })
    const designExerciseId = seedExercise()
    const updated = { ...snapshot, session: { version: 0 } }

    design.saveScene({ designExerciseId, snapshot })
    design.saveScene({ designExerciseId, snapshot: updated })

    expect(design.loadScene({ designExerciseId })).toEqual(updated)
  })

  it('rejects an invalid exercise id or snapshot', () => {
    const design = createDesignIpc(db, { allowScratch: false })
    const designExerciseId = seedExercise()

    expect(() => design.loadScene({ designExerciseId: 0 })).toThrow(/Invalid design exercise id/)
    expect(() => design.saveScene({ designExerciseId: 1.5, snapshot })).toThrow(/Invalid/)
    expect(() => design.saveScene({ designExerciseId, snapshot: [] })).toThrow(/JSON object/)
    expect(() => design.saveScene({ designExerciseId, snapshot: null })).toThrow(/JSON object/)
  })

  it('fails to save a scene for an unknown exercise', () => {
    const design = createDesignIpc(db, { allowScratch: false })

    expect(() => design.saveScene({ designExerciseId: 999, snapshot })).toThrow()
  })

  it('gets or creates the same scratch exercise', () => {
    const design = createDesignIpc(db, { allowScratch: true })

    const first = design.openScratchExercise()
    const second = design.openScratchExercise()

    expect(first.slug).toBe(SCRATCH_DESIGN_EXERCISE_SLUG)
    expect(second).toEqual(first)
  })

  it('validates a Design Export and returns its counts', () => {
    const design = createDesignIpc(db, { allowScratch: false })
    const graph: DesignGraph = {
      version: 1,
      nodes: [
        { id: 'shape:a', componentType: 'service', label: 'API' },
        { id: 'shape:b', componentType: 'cache', label: 'Cache' }
      ],
      edges: [{ id: 'shape:e', from: 'shape:a', to: 'shape:b', label: '', direction: 'forward' }],
      annotations: [{ id: 'shape:t', kind: 'text', text: 'TTL 1h', nearestNodeId: 'shape:b' }],
      danglingArrows: [],
      groups: []
    }
    const png = {
      base64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
      width: 1,
      height: 1
    }

    expect(
      design.exportScene({ designExerciseId: 1, graph, description: 'API -> Cache', png })
    ).toEqual({ nodes: 2, edges: 1, annotations: 1, danglingArrows: 0, groups: 0, pngBytes: 68 })
    expect(() =>
      design.exportScene({
        designExerciseId: 1,
        graph: {
          ...graph,
          edges: [{ id: 'shape:e', from: 'shape:a', to: 'shape:x', label: '', direction: 'none' }]
        },
        description: '',
        png: null
      })
    ).toThrow(/Unknown node id/)
  })

  it('refuses the scratch exercise when not allowed', () => {
    const design = createDesignIpc(db, { allowScratch: false })

    expect(() => design.openScratchExercise()).toThrow(/only available in dev/)
  })
})
