import { describe, expect, it } from 'vitest'
import { emptyHistory, MAX_HISTORY, record, redo, undo } from './history'

describe('history', () => {
  it('has nothing to undo or redo at first', () => {
    expect(undo(emptyHistory<string>(), 'a')).toBeNull()
    expect(redo(emptyHistory<string>(), 'a')).toBeNull()
  })

  it('undoes and redoes along the recorded states', () => {
    let history = record(record(emptyHistory<string>(), 'a'), 'b')
    const first = undo(history, 'c')!
    expect(first.state).toBe('b')
    history = first.history
    const second = undo(history, 'b')!
    expect(second.state).toBe('a')
    expect(undo(second.history, 'a')).toBeNull()
    const again = redo(second.history, 'a')!
    expect(again.state).toBe('b')
    expect(redo(again.history, 'b')?.state).toBe('c')
  })

  it('drops the redo steps when a new change is recorded', () => {
    const undone = undo(record(emptyHistory<string>(), 'a'), 'b')!
    expect(undone.history.future).toEqual(['b'])
    expect(record(undone.history, 'x').future).toEqual([])
  })

  it('keeps the latest steps only', () => {
    let history = emptyHistory<number>()
    for (let i = 0; i < MAX_HISTORY + 20; i++) history = record(history, i)
    expect(history.past).toHaveLength(MAX_HISTORY)
    expect(history.past[0]).toBe(20)
  })
})
