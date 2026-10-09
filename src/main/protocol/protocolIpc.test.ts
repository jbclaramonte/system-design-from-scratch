import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LessonStreamEvent } from '../../shared/lesson'
import { corpusPath, loadCorpus } from '../corpus'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import type { GenerationClient } from '../generation/ipc'
import { GenerationService } from '../generation/service'
import { installFakeCli, type FakeCli } from '../generation/testing/fakeCli'
import { listDesignExercises } from '../db/repositories/designPractice'
import { createExerciseLockGuard } from '../path/lock'
import { seedDesignExercises } from './designExercises'
import { createProtocolIpc, type ProtocolIpc } from './protocolIpc'
import { createProtocolService } from './service'

const corpus = loadCorpus(corpusPath(join(import.meta.dirname, '../../..')))

class FakeClient extends EventEmitter implements GenerationClient {
  readonly sent: LessonStreamEvent[] = []
  destroyed = false

  send(channel: string, payload: unknown): void {
    expect(channel).toBe('protocol:event')
    this.sent.push(payload as LessonStreamEvent)
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

let db: Database
let fake: FakeCli
let generation: GenerationService
let ipc: ProtocolIpc
let exerciseId: number

function create(allowDevFixture: boolean): ProtocolIpc {
  const deps = { db, corpus, service: generation }
  return createProtocolIpc(deps, createProtocolService(deps), { allowDevFixture })
}

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  fake = installFakeCli()
  generation = new GenerationService({
    db,
    cli: { env: fake.env },
    resolveCli: async () => fake.bin
  })
  ipc = create(true)
  exerciseId = ipc.openDevExercise({ exerciseIndex: 1 }).id
})

afterEach(() => {
  generation.dispose()
  fake.cleanup()
  db.close()
})

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 20))
}

describe('protocol IPC', () => {
  it('refuses every entry of a locked Design Exercise outside dev, before any Generation', async () => {
    seedDesignExercises(db, corpus)
    const twitter = listDesignExercises(db).find((e) => e.slug === 'twitter')!.id
    const deps = { db, corpus, service: generation }
    const locked = createProtocolIpc(deps, createProtocolService(deps), {
      allowDevFixture: false,
      assertExerciseUnlocked: createExerciseLockGuard(deps, { allowLockedExercises: false })
    })
    const client = new FakeClient()
    const text = { type: 'text' as const, text: 'x' }
    const base = { designExerciseId: twitter }
    const step = 'functional_requirements' as const
    expect(() => locked.getExercise(base)).toThrow(/is locked/)
    expect(() => locked.saveDraft({ ...base, step, text: 'x' })).toThrow(/is locked/)
    expect(() => locked.markLessonSeen({ ...base, step })).toThrow(/is locked/)
    await expect(
      locked.submitStep({ ...base, requestId: 'a', step, submission: text }, client)
    ).rejects.toThrow(/is locked/)
    await expect(
      locked.requestHint({ ...base, requestId: 'b', step, current: text }, client)
    ).rejects.toThrow(/is locked/)
    await expect(locked.requestFinalReview({ ...base, requestId: 'c' }, client)).rejects.toThrow(
      /is locked/
    )
    expect(fake.calls()).toHaveLength(0)
    // The dev fixture is outside the Learning Path: never locked.
    expect(locked.getExercise({ designExerciseId: exerciseId }).id).toBe(exerciseId)
  })

  it('rejects the dev fixture in a packaged app', () => {
    expect(() => create(false).openDevExercise({ exerciseIndex: 1 })).toThrow(
      /only available in dev/
    )
  })

  it('validates requests', async () => {
    const client = new FakeClient()
    expect(() => ipc.openDevExercise({ exerciseIndex: 0 })).toThrow()
    expect(() => ipc.getExercise({ designExerciseId: -1 })).toThrow()
    expect(() =>
      ipc.saveDraft({ designExerciseId: exerciseId, step: 'phase' as never, text: '' })
    ).toThrow()
    expect(() =>
      ipc.saveDraft({
        designExerciseId: exerciseId,
        step: 'functional_requirements',
        text: 'x'.repeat(20_001)
      })
    ).toThrow()
    await expect(
      ipc.submitStep(
        {
          requestId: 'r1',
          designExerciseId: exerciseId,
          step: 'high_level_design',
          submission: {
            type: 'canvas',
            designExport: {
              designExerciseId: exerciseId,
              graph: { version: 1 } as never,
              description: '',
              png: null
            },
            notes: ''
          }
        },
        client
      )
    ).rejects.toThrow()
    await expect(
      ipc.requestHint(
        {
          requestId: 'r2',
          designExerciseId: exerciseId,
          step: 'functional_requirements',
          current: { type: 'image' } as never
        },
        client
      )
    ).rejects.toThrow()
    expect(fake.calls()).toHaveLength(0)
  })

  it('streams a Protocol Step Lesson with its sources', async () => {
    const client = new FakeClient()
    ipc.startStepLesson({ requestId: 'lesson-1', step: 'functional_requirements' }, client)
    await until(() => client.sent.some(({ event }) => event.type === 'done'))
    const events = client.sent.map(({ event }) => event)
    expect(client.sent.every(({ requestId }) => requestId === 'lesson-1')).toBe(true)
    expect(events[0]).toMatchObject({ type: 'prepared', grounded: true, notions: [] })
    const prepared = events[0]
    if (prepared?.type === 'prepared') {
      expect(prepared.sources[0]!.sectionId).toMatch(/^how-to-approach/)
    }
    expect(events.some((event) => event.type === 'text_delta')).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('cancels a step feedback by request id', async () => {
    const client = new FakeClient()
    const pending = ipc.submitStep(
      {
        requestId: 'submit-1',
        designExerciseId: exerciseId,
        step: 'functional_requirements',
        submission: { type: 'text', text: 'scenario:slow' }
      },
      client
    )
    await until(() => fake.calls().length > 0)
    ipc.cancel({ requestId: 'submit-1' })
    expect(await pending).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })
  })

  it('cancels a Hint when its window closes', async () => {
    const client = new FakeClient()
    const pending = ipc.requestHint(
      {
        requestId: 'hint-1',
        designExerciseId: exerciseId,
        step: 'functional_requirements',
        current: { type: 'text', text: 'scenario:slow' }
      },
      client
    )
    await until(() => fake.calls().length > 0)
    client.destroy()
    expect(await pending).toMatchObject({ status: 'failed', error: { code: 'cancelled' } })
  })

  it('refuses a request id already running', async () => {
    const client = new FakeClient()
    const request = {
      requestId: 'same',
      designExerciseId: exerciseId,
      step: 'functional_requirements' as const,
      current: { type: 'text' as const, text: 'scenario:slow' }
    }
    const first = ipc.requestHint(request, client)
    await expect(ipc.requestHint(request, client)).rejects.toThrow(/already running/)
    ipc.cancel({ requestId: 'same' })
    await first
  })
})
