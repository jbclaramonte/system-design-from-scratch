import type { GenerationPriority } from '../../shared/generation'

export const DEFAULT_CONCURRENCY = 2

export interface QueueOptions {
  /** Maximum number of CLI processes at once (default 2). */
  concurrency?: number
  /**
   * Maximum number of background jobs running at once. Defaults to `concurrency - 1` (at least
   * 1), so a foreground request normally finds a free slot instead of waiting for a
   * pre-generation to finish.
   */
  maxBackground?: number
}

export interface QueueTask {
  priority: GenerationPriority
  run: () => Promise<void>
}

/**
 * Runs tasks with a concurrency limit. Foreground tasks always start before queued background
 * ones; running tasks are never interrupted (they are paid for already).
 */
export class GenerationQueue {
  readonly concurrency: number
  readonly maxBackground: number
  private readonly waiting: QueueTask[] = []
  private readonly running = new Set<QueueTask>()

  constructor(options: QueueOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
    this.maxBackground = Math.min(
      this.concurrency,
      Math.max(1, options.maxBackground ?? this.concurrency - 1)
    )
  }

  get runningCount(): number {
    return this.running.size
  }

  get waitingCount(): number {
    return this.waiting.length
  }

  add(task: QueueTask): void {
    this.waiting.push(task)
    this.pump()
  }

  /** Removes a task that has not started yet. Returns false if it already started. */
  remove(task: QueueTask): boolean {
    const index = this.waiting.indexOf(task)
    if (index < 0) return false
    this.waiting.splice(index, 1)
    return true
  }

  /** Turns a waiting background task into a foreground one (a learner now waits for it). */
  promote(task: QueueTask): void {
    task.priority = 'foreground'
    this.pump()
  }

  private next(): QueueTask | undefined {
    const foreground = this.waiting.find((task) => task.priority === 'foreground')
    if (foreground) return foreground
    const runningBackground = [...this.running].filter((t) => t.priority === 'background').length
    if (runningBackground >= this.maxBackground) return undefined
    return this.waiting[0]
  }

  private pump(): void {
    while (this.running.size < this.concurrency) {
      const task = this.next()
      if (!task) return
      this.remove(task)
      this.running.add(task)
      void task
        .run()
        .catch(() => {})
        .finally(() => {
          this.running.delete(task)
          this.pump()
        })
    }
  }
}
