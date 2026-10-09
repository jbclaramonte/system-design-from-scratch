import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GenerationStreamEvent } from '../../shared/ipc'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import type { CliCallOptions } from './cliRunner'
import { GenerationError } from './errors'
import { createGenerationIpc, type GenerationClient } from './ipc'
import { GenerationService, type CliRunner } from './service'

class FakeClient extends EventEmitter implements GenerationClient {
  readonly sent: GenerationStreamEvent[] = []
  destroyed = false

  send(channel: string, payload: unknown): void {
    expect(channel).toBe('generation:event')
    this.sent.push(payload as GenerationStreamEvent)
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
let calls: CliCallOptions[]
let client: FakeClient

const runner: CliRunner = (options) =>
  new Promise((resolve, reject) => {
    calls.push(options)
    options.signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
    if (options.prompt.includes('"wait":true')) return
    options.onEvent?.({ type: 'text_delta', text: 'Bonjour' })
    resolve({
      isError: false,
      subtype: 'success',
      text: 'Bonjour',
      structuredOutput: undefined,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    })
  })

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  calls = []
  client = new FakeClient()
})

afterEach(() => db.close())

const ipcFor = () =>
  createGenerationIpc(new GenerationService({ db, runner, resolveCli: async () => '/x/claude' }))

const eventsOf = (requestId: string) =>
  client.sent.filter((e) => e.requestId === requestId).map((e) => e.event.type)

describe('createGenerationIpc', () => {
  it('streams events tagged with the request id', async () => {
    const ipc = ipcFor()

    ipc.start({ requestId: 'r1', kind: 'lesson', input: { topic: 'cache' } }, client)

    await expect.poll(() => eventsOf('r1')).toEqual(['queued', 'started', 'text_delta', 'done'])
    expect(calls[0]?.prompt).toContain('PLACEHOLDER')
  })

  it('cancels a request', async () => {
    const ipc = ipcFor()
    ipc.start({ requestId: 'r1', kind: 'lesson', input: { wait: true } }, client)
    await expect.poll(() => calls.length).toBe(1)

    ipc.cancel({ requestId: 'r1' })

    await expect
      .poll(() => client.sent.at(-1)?.event)
      .toMatchObject({
        type: 'error',
        error: { code: 'cancelled' }
      })
  })

  it('cancels the runs of a destroyed window', async () => {
    const ipc = ipcFor()
    ipc.start({ requestId: 'r1', kind: 'lesson', input: { wait: true } }, client)
    await expect.poll(() => calls.length).toBe(1)

    client.destroy()

    await expect.poll(() => calls[0]?.signal?.aborted).toBe(true)
  })

  it('rejects malformed and duplicate requests', () => {
    const ipc = ipcFor()

    expect(() => ipc.start({ requestId: 'r1', kind: 'nope', input: {} } as never, client)).toThrow()
    ipc.start({ requestId: 'r2', kind: 'lesson', input: { wait: true } }, client)
    expect(() => ipc.start({ requestId: 'r2', kind: 'lesson', input: {} }, client)).toThrow(
      /already running/
    )
  })
})
