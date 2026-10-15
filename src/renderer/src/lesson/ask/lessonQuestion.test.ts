import { describe, expect, it } from 'vitest'
import {
  LESSON_QUESTION_MAX_SELECTION,
  LESSON_QUESTION_MAX_THREAD
} from '../../../../shared/lessonQuestion'
import {
  askButtonPosition,
  emptyThread,
  exchangesBefore,
  isAnswering,
  isAskShortcut,
  threadReducer,
  toPassage,
  type ThreadAction,
  type ThreadState
} from './lessonQuestion'

describe('toPassage', () => {
  it('collapses blanks and trims', () => {
    expect(toPassage('  Le   cache est \t rapide.  ')).toBe('Le cache est rapide.')
    expect(toPassage('Un paragraphe.\n\n\n\nUn autre.')).toBe('Un paragraphe.\n\nUn autre.')
    expect(toPassage('une ligne \n  suivante')).toBe('une ligne\nsuivante')
  })

  it('ignores selections too short to ask about', () => {
    expect(toPassage('')).toBeNull()
    expect(toPassage('  \n ')).toBeNull()
    expect(toPassage(' ab ')).toBeNull()
    expect(toPassage('abc')).toBe('abc')
  })

  it('cuts a long selection to what the main process accepts', () => {
    const passage = toPassage('mot '.repeat(1000))!

    expect(passage.length).toBeLessThanOrEqual(LESSON_QUESTION_MAX_SELECTION)
    expect(passage.endsWith('…')).toBe(true)
  })
})

describe('isAskShortcut', () => {
  const key = (init: Partial<KeyboardEvent>) => ({
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...init
  })

  it('is Ctrl+Shift+A or Cmd+Shift+A, nothing else', () => {
    expect(isAskShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isAskShortcut(key({ metaKey: true, shiftKey: true, key: 'A' }))).toBe(true)
    expect(isAskShortcut(key({ ctrlKey: true }))).toBe(false) // select all
    expect(isAskShortcut(key({ shiftKey: true }))).toBe(false)
    expect(isAskShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true }))).toBe(false)
    expect(isAskShortcut(key({ ctrlKey: true, shiftKey: true, key: 'b' }))).toBe(false)
  })
})

describe('askButtonPosition', () => {
  const viewport = { width: 1000, height: 700 }

  it('sits under the end of the selection', () => {
    expect(askButtonPosition({ right: 300, bottom: 200 }, viewport)).toEqual({
      top: 206,
      left: 300
    })
  })

  it('stays inside the window: left of the right edge, above when there is no room below', () => {
    const position = askButtonPosition({ right: 990, bottom: 690 }, viewport)

    expect(position.left).toBe(1000 - 64)
    expect(position.top).toBeLessThan(690)
    expect(position.top).toBeGreaterThanOrEqual(0)
  })
})

describe('threadReducer', () => {
  const run = (...actions: ThreadAction[]): ThreadState =>
    actions.reduce(threadReducer, emptyThread)
  const ask = (id: string): ThreadAction => ({
    type: 'ask',
    id,
    selection: `passage ${id}`,
    question: `question ${id}`
  })
  const finish = (id: string, text: string): ThreadAction[] => [
    { type: 'answer', id, action: { type: 'text', text } },
    {
      type: 'answer',
      id,
      action: {
        type: 'event',
        event: {
          type: 'done',
          output: {
            content: text,
            fromCache: false,
            grounded: true,
            sourceSections: [],
            cacheKey: null,
            usage: null
          }
        }
      }
    }
  ]

  it('starts an exchange per question, streams the answer into it', () => {
    const state = run(ask('a'), { type: 'answer', id: 'a', action: { type: 'text', text: 'Bon' } })

    expect(state.exchanges).toHaveLength(1)
    expect(state.exchanges[0]).toMatchObject({
      selection: 'passage a',
      question: 'question a',
      answer: { status: 'generating', text: 'Bon' }
    })
    expect(isAnswering(state)).toBe(true)
  })

  it('is no longer answering once the answer is done, failed or refused', () => {
    const done = run(ask('a'), ...finish('a', 'Réponse.'))
    const failed = run(ask('a'), {
      type: 'answer',
      id: 'a',
      action: { type: 'event', event: { type: 'error', error: { code: 'timeout', message: 'x' } } }
    })
    const refused = run(ask('a'), { type: 'refused', id: 'a', message: 'No.' })

    expect(isAnswering(done)).toBe(false)
    expect(isAnswering(failed)).toBe(false)
    expect(isAnswering(refused)).toBe(false)
    expect(refused.exchanges[0]!.refusal).toBe('No.')
  })

  it('a retry restarts the same exchange from scratch', () => {
    const state = run(
      ask('a'),
      { type: 'refused', id: 'a', message: 'No.' },
      { type: 'retry', id: 'a' }
    )

    expect(state.exchanges).toHaveLength(1)
    expect(state.exchanges[0]).toMatchObject({ refusal: null, answer: { status: 'starting' } })
  })

  it('sends back only the finished exchanges before the current one, most recent few', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const state = run(
      ...ids.flatMap((id) => [ask(id), ...finish(id, `answer ${id}`)]),
      ask('f'),
      // an earlier one that failed is not context
      ask('g')
    )

    const before = exchangesBefore(state, 'f')
    expect(before).toHaveLength(LESSON_QUESTION_MAX_THREAD)
    expect(before.map((exchange) => exchange.question)).toEqual([
      'question c',
      'question d',
      'question e'
    ])
    expect(before[0]).toEqual({
      selection: 'passage c',
      question: 'question c',
      answer: 'answer c'
    })
    // 'f' never finished: it is not context for 'g'.
    expect(exchangesBefore(state, 'g').map((e) => e.question)).not.toContain('question f')
  })
})
