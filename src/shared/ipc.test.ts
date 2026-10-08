import { describe, expect, it, vi } from 'vitest'
import { apiChannels, createApi } from './ipc'

describe('createApi', () => {
  it('exposes one method per contract entry', () => {
    const api = createApi(vi.fn())

    expect(Object.keys(api).sort()).toEqual(Object.keys(apiChannels).sort())
  })

  it('forwards each call to its channel with the request', async () => {
    const invoke = vi.fn((channel: string) => Promise.resolve(`reply from ${channel}`))
    const api = createApi(invoke)

    await expect(api.getAppVersion()).resolves.toBe('reply from app:getVersion')
    await expect(api.ping({ message: 'hello' })).resolves.toBe('reply from system:ping')
    expect(invoke).toHaveBeenNthCalledWith(1, 'app:getVersion', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'system:ping', { message: 'hello' })
  })

  it('maps every method to a distinct channel', () => {
    const channels = Object.values(apiChannels)

    expect(new Set(channels).size).toBe(channels.length)
  })
})
