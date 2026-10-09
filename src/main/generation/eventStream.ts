/** Single-consumer async iterable fed by `push`, ended by `end`. Buffers until read. */
export class EventStream<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = []
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = []
  private ended = false

  push(value: T): void {
    if (this.ended) return
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value, done: false })
    else this.buffer.push(value)
  }

  end(): void {
    this.ended = true
    for (const waiter of this.waiters.splice(0)) waiter({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length) return Promise.resolve({ value: this.buffer.shift()!, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      },
      return: () => {
        this.buffer.length = 0
        this.end()
        return Promise.resolve({ value: undefined, done: true })
      }
    }
  }
}
