import { describe, expect, it } from 'vitest'
import { choiceMark } from './choiceMark'

const item = (correct: boolean, selected: boolean) => ({ text: 'x', correct, selected })

describe('choiceMark', () => {
  it('marks a picked correct choice as correct, whatever the type', () => {
    expect(choiceMark(item(true, true), 'single_choice').state).toBe('correct')
    expect(choiceMark(item(true, true), 'multiple_choice').state).toBe('correct')
    expect(choiceMark(item(true, true), 'scenario').label).toBe('Correct')
  })

  it('marks a picked wrong choice as wrong', () => {
    expect(choiceMark(item(false, true), 'multiple_choice')).toEqual({
      state: 'wrong',
      label: 'Wrong',
      glyph: '✕'
    })
  })

  it('marks a correct choice left out of a multiple choice as missed', () => {
    expect(choiceMark(item(true, false), 'multiple_choice')).toEqual({
      state: 'missed',
      label: 'Missed',
      glyph: '!'
    })
  })

  it('shows the correct choice of a single choice or scenario as the answer', () => {
    expect(choiceMark(item(true, false), 'single_choice').state).toBe('answer')
    expect(choiceMark(item(true, false), 'scenario').label).toBe('Correct answer')
  })

  it('leaves an unpicked wrong choice neutral, with no label', () => {
    expect(choiceMark(item(false, false), 'multiple_choice')).toEqual({
      state: 'neutral',
      label: null,
      glyph: ''
    })
  })
})
