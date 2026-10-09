export interface DebouncedSaveOptions<T> {
  delayMs: number
  /** Reads the value to save. Called synchronously when a save fires. */
  capture: () => T
  save: (value: T) => Promise<void>
  onError: (error: unknown) => void
}

export interface DebouncedSave {
  /** Records a change; the save fires `delayMs` after the last change. */
  markDirty(): void
  /** Saves now if there is an unsaved change. Resolves when every started save has settled. */
  flush(): Promise<void>
  /** Drops the pending change without saving. */
  cancel(): void
}

/**
 * Debounced autosave. The value is captured when the save fires, not on every change, and saves
 * run one after the other so an older value never overwrites a newer one.
 */
export function createDebouncedSave<T>({
  delayMs,
  capture,
  save,
  onError
}: DebouncedSaveOptions<T>): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let chain: Promise<void> = Promise.resolve()

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const flush = () => {
    clearTimer()
    if (dirty) {
      dirty = false
      let value: T
      try {
        value = capture()
      } catch (error) {
        onError(error)
        return chain
      }
      chain = chain.then(() => save(value)).catch(onError)
    }
    return chain
  }

  return {
    markDirty() {
      dirty = true
      clearTimer()
      timer = setTimeout(() => void flush(), delayMs)
    },
    flush,
    cancel() {
      clearTimer()
      dirty = false
    }
  }
}
