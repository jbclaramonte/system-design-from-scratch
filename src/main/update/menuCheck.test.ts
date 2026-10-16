import { describe, expect, it, vi } from 'vitest'
import type { UpdateCheckResult } from '../../shared/update'
import { createMenuCheck } from './menuCheck'

describe('createMenuCheck', () => {
  it('runs the service check and publishes its result, whatever it is', async () => {
    const results: UpdateCheckResult[] = [
      { status: 'upToDate', currentVersion: '0.4.0' },
      {
        status: 'available',
        update: {
          version: '0.5.0',
          releaseUrl: 'https://example.test',
          install: { canInstall: true }
        }
      },
      { status: 'error', error: { code: 'network', message: 'Offline.' } }
    ]
    for (const result of results) {
      const check = vi.fn(async () => result)
      const publish = vi.fn()
      await createMenuCheck({ check, publish })()
      expect(check).toHaveBeenCalledTimes(1)
      expect(publish).toHaveBeenCalledWith(result)
    }
  })

  it('publishes a readable error when the check throws', async () => {
    const publish = vi.fn()
    await createMenuCheck({
      check: () => Promise.reject(new Error('boom')),
      publish
    })()
    expect(publish).toHaveBeenCalledWith({
      status: 'error',
      error: { code: 'unknown', message: expect.stringContaining('boom') }
    })
  })
})
