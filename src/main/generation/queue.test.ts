import { describe, expect, it } from 'vitest'
import type { GenerationPriority } from '../../shared/generation'
import { GenerationQueue, type QueueTask } from './queue'

/** A task that runs until `finish()` is called, recording its start. */
function task(name: string, priority: GenerationPriority, started: string[]) {
  let finish!: () => void
  const done = new Promise<void>((resolve) => (finish = resolve))
  const queued: QueueTask = {
    priority,
    run: () => {
      started.push(name)
      return done
    }
  }
  return { queued, finish: async () => (finish(), await done, await Promise.resolve()) }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('GenerationQueue', () => {
  it('never runs more than the concurrency limit', async () => {
    const started: string[] = []
    const queue = new GenerationQueue({ concurrency: 2 })
    const tasks = ['a', 'b', 'c'].map((name) => task(name, 'foreground', started))

    tasks.forEach((t) => queue.add(t.queued))

    expect(started).toEqual(['a', 'b'])
    expect(queue.runningCount).toBe(2)
    await tasks[0]!.finish()
    await tick()
    expect(started).toEqual(['a', 'b', 'c'])
  })

  it('starts waiting foreground tasks before background ones', async () => {
    const started: string[] = []
    const queue = new GenerationQueue({ concurrency: 1 })
    const first = task('first', 'foreground', started)
    queue.add(first.queued)
    queue.add(task('bg', 'background', started).queued)
    queue.add(task('fg', 'foreground', started).queued)

    await first.finish()
    await tick()

    expect(started).toEqual(['first', 'fg'])
  })

  it('keeps a slot free for foreground work by default', () => {
    const started: string[] = []
    const queue = new GenerationQueue({ concurrency: 2 })

    queue.add(task('bg1', 'background', started).queued)
    queue.add(task('bg2', 'background', started).queued)
    queue.add(task('fg', 'foreground', started).queued)

    expect(queue.maxBackground).toBe(1)
    expect(started).toEqual(['bg1', 'fg'])
  })

  it('promotes a waiting background task', () => {
    const started: string[] = []
    const queue = new GenerationQueue({ concurrency: 2 })
    queue.add(task('bg1', 'background', started).queued)
    const bg2 = task('bg2', 'background', started)
    queue.add(bg2.queued)

    queue.promote(bg2.queued)

    expect(started).toEqual(['bg1', 'bg2'])
  })

  it('removes a waiting task but not a running one', () => {
    const queue = new GenerationQueue({ concurrency: 1 })
    const running = task('a', 'foreground', [])
    const waiting = task('b', 'foreground', [])
    queue.add(running.queued)
    queue.add(waiting.queued)

    expect(queue.remove(running.queued)).toBe(false)
    expect(queue.remove(waiting.queued)).toBe(true)
    expect(queue.waitingCount).toBe(0)
  })
})
