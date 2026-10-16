import { describe, expect, it, vi } from 'vitest'
import type { UpdateProgress } from '../../shared/update'
import type { IpcEventTarget } from '../ipc/sendEvent'
import type { UpdateService } from './service'
import { createUpdateIpc } from './updateIpc'

function setup() {
  const service: UpdateService = {
    checkAtLaunch: vi.fn(),
    check: vi.fn(async () => ({ status: 'upToDate' as const, currentVersion: '0.3.0' })),
    pending: vi.fn(() => null),
    dismiss: vi.fn(),
    install: vi.fn(async (_version: string, onProgress: (progress: UpdateProgress) => void) => {
      onProgress({ phase: 'verifying' })
      return { ok: true as const }
    })
  }
  const sent: [string, unknown][] = []
  const sender: IpcEventTarget = {
    send: (channel, payload) => void sent.push([channel, payload]),
    isDestroyed: () => false
  }
  return { service, sender, sent, ipc: createUpdateIpc(service) }
}

describe('update IPC', () => {
  it('forwards check and pending to the service', async () => {
    const { ipc, service } = setup()
    expect(await ipc.check()).toEqual({ status: 'upToDate', currentVersion: '0.3.0' })
    expect(ipc.pending()).toBeNull()
    expect(service.check).toHaveBeenCalledTimes(1)
  })

  it('validates the version of install and dismiss', async () => {
    const { ipc, service, sender } = setup()
    for (const bad of [
      {},
      { version: 3 },
      { version: 'latest' },
      { version: '1.2.3', extra: 1 },
      undefined
    ]) {
      expect(() => ipc.dismiss(bad as never)).toThrow()
      expect(() => ipc.install(bad as never, sender)).toThrow()
    }
    expect(service.dismiss).not.toHaveBeenCalled()
    expect(service.install).not.toHaveBeenCalled()
  })

  it('dismisses a version', () => {
    const { ipc, service } = setup()
    ipc.dismiss({ version: '0.3.1' })
    expect(service.dismiss).toHaveBeenCalledWith('0.3.1')
  })

  it('installs and pushes the progress to the window that asked', async () => {
    const { ipc, sender, sent } = setup()
    expect(await ipc.install({ version: '0.3.1' }, sender)).toEqual({ ok: true })
    expect(sent).toEqual([['update:progress', { phase: 'verifying' }]])
  })
})
