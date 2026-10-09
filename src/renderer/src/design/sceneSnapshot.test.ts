import type { TLEditorSnapshot } from 'tldraw'
import { describe, expect, it } from 'vitest'
import { deserializeScene, serializeScene } from './sceneSnapshot'

const snapshot = {
  document: {
    store: {
      'shape:db': { id: 'shape:db', typeName: 'shape', type: 'database', props: { text: 'Users' } }
    },
    schema: { schemaVersion: 2, sequences: {} }
  },
  session: { version: 0, currentPageId: 'page:page', pageStates: [] }
} as unknown as TLEditorSnapshot

describe('scene snapshot', () => {
  it('round-trips a snapshot through JSON', () => {
    const stored = JSON.parse(JSON.stringify(serializeScene(snapshot)))

    expect(deserializeScene(stored)).toEqual(snapshot)
  })

  it('drops undefined fields so the payload is plain JSON', () => {
    const withUndefined = { ...snapshot, session: { ...snapshot.session, extra: undefined } }

    expect(serializeScene(withUndefined as TLEditorSnapshot)).toEqual(snapshot)
  })

  it('returns undefined when the exercise has no scene yet', () => {
    expect(deserializeScene(null)).toBeUndefined()
  })

  it('throws on a value that is not a tldraw snapshot', () => {
    expect(() => deserializeScene({})).toThrow(/not a tldraw snapshot/)
    expect(() => deserializeScene({ document: { store: {} } })).toThrow()
    expect(() => deserializeScene([])).toThrow()
    expect(() => deserializeScene('scene')).toThrow()
  })
})
