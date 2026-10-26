import { describe, expect, it } from 'vitest'
import { lastSeenText, missedOfText, resultMarkLabel } from './memoryReviewText'

// Local-time dates: the text counts calendar days, like the learner does.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0)
const now = at(26, 12)

describe('missedOfText', () => {
  it('says how many of the latest answers were missed', () => {
    expect(missedOfText(4, 6)).toBe('Missed 4 of last 6')
    expect(missedOfText(0, 6)).toBe('Missed 0 of last 6')
    expect(missedOfText(1, 3)).toBe('Missed 1 of last 3')
  })
})

describe('lastSeenText', () => {
  it('says "today" for an answer given earlier the same day', () => {
    expect(lastSeenText(at(26, 8).toISOString(), now)).toBe('Last seen today')
  })

  it('says "yesterday" for the previous calendar day, even a few hours ago', () => {
    expect(lastSeenText(at(25, 23).toISOString(), at(26, 1))).toBe('Last seen yesterday')
    expect(lastSeenText(at(25, 9).toISOString(), now)).toBe('Last seen yesterday')
  })

  it('counts days from two days on', () => {
    expect(lastSeenText(at(24, 18).toISOString(), now)).toBe('Last seen 2 days ago')
    expect(lastSeenText(at(23, 8).toISOString(), now)).toBe('Last seen 3 days ago')
  })

  it('never says a future time, and handles an unknown date', () => {
    expect(lastSeenText(at(27, 9).toISOString(), now)).toBe('Last seen today')
    expect(lastSeenText(null, now)).toBe('Not seen yet')
    expect(lastSeenText('not a date', now)).toBe('Not seen yet')
  })
})

describe('resultMarkLabel', () => {
  it('names a result in words, never by color alone', () => {
    expect(resultMarkLabel(true)).toBe('Correct')
    expect(resultMarkLabel(false)).toBe('Missed')
  })
})
