import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedSave } from './debouncedSave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(save = vi.fn<(value: number) => Promise<void>>(async () => {})) {
  let value = 0
  const capture = vi.fn(() => value)
  const onError = vi.fn()
  const autosave = createDebouncedSave({ delayMs: 500, capture, save, onError })
  return { autosave, capture, save, onError, set: (next: number) => (value = next) }
}

describe('createDebouncedSave', () => {
  it('saves once, after the delay since the last change, with the latest value', async () => {
    const { autosave, capture, save, set } = setup()

    set(1)
    autosave.markDirty()
    await vi.advanceTimersByTimeAsync(400)
    set(2)
    autosave.markDirty()
    await vi.advanceTimersByTimeAsync(400)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('flush saves a pending change immediately and only once', async () => {
    const { autosave, save, set } = setup()

    set(3)
    autosave.markDirty()
    await autosave.flush()
    await vi.advanceTimersByTimeAsync(1000)

    expect(save).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('flush without a change does not save', async () => {
    const { autosave, save } = setup()

    await autosave.flush()

    expect(save).not.toHaveBeenCalled()
  })

  it('runs saves one after the other, in order', async () => {
    const order: string[] = []
    let release!: () => void
    const save = vi.fn(async (value: number) => {
      order.push(`start ${value}`)
      if (value === 1) await new Promise<void>((resolve) => (release = resolve))
      order.push(`end ${value}`)
    })
    const { autosave, set } = setup(save)

    set(1)
    autosave.markDirty()
    void autosave.flush()
    set(2)
    autosave.markDirty()
    const second = autosave.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1'])

    release()
    await second
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('reports a failed save and keeps saving later changes', async () => {
    const save = vi.fn(async (value: number) => {
      if (value === 1) throw new Error('disk full')
    })
    const { autosave, onError, set } = setup(save)

    set(1)
    autosave.markDirty()
    await autosave.flush()
    set(2)
    autosave.markDirty()
    await autosave.flush()

    expect(onError).toHaveBeenCalledExactlyOnceWith(new Error('disk full'))
    expect(save).toHaveBeenLastCalledWith(2)
  })

  it('cancel drops the pending change', async () => {
    const { autosave, save } = setup()

    autosave.markDirty()
    autosave.cancel()
    await vi.advanceTimersByTimeAsync(1000)
    await autosave.flush()

    expect(save).not.toHaveBeenCalled()
  })
})
