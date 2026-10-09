import { describe, expect, it, vi } from 'vitest'
import { apiChannels, apiEvents, createApi } from './ipc'

describe('createApi', () => {
  it('exposes one method per contract entry', () => {
    const api = createApi(vi.fn(), vi.fn())

    expect(Object.keys(api).sort()).toEqual(
      [...Object.keys(apiChannels), ...Object.keys(apiEvents)].sort()
    )
  })

  it('forwards each call to its channel with the request', async () => {
    const invoke = vi.fn((channel: string) => Promise.resolve(`reply from ${channel}`))
    const api = createApi(invoke, vi.fn())

    await expect(api.getAppVersion()).resolves.toBe('reply from app:getVersion')
    await expect(api.ping({ message: 'hello' })).resolves.toBe('reply from system:ping')
    expect(invoke).toHaveBeenNthCalledWith(1, 'app:getVersion', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'system:ping', { message: 'hello' })
  })

  it('subscribes event listeners to their channel and returns the unsubscribe', () => {
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => unsubscribe)
    const api = createApi(vi.fn(), subscribe)
    const listener = vi.fn()

    const returned = api.onGenerationEvent(listener)

    expect(subscribe).toHaveBeenCalledWith('generation:event', listener)
    expect(returned).toBe(unsubscribe)
  })

  it('maps every method to a distinct channel', () => {
    const channels = Object.values(apiChannels)

    expect(new Set(channels).size).toBe(channels.length)
  })
})
