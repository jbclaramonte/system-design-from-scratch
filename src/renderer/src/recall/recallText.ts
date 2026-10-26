/** Copy of the Recall Quiz screens: plain counts, never a verdict. */

/** The "Often missed" tag: how many of the latest answers on the Notion were missed. */
export const oftenMissedText = (missed: number, of: number): string =>
  `You missed this notion in ${missed} of your last ${of} ${of === 1 ? 'answer' : 'answers'}`

/** `index` is the 1-based position of the question. */
export const progressText = (index: number, total: number): string =>
  `Question ${index} of ${total}`

export const subtitleText = (): string => 'A quick check on your earlier lessons'

/** The summary line of the results: a count, with no pass or fail. */
export const scoreSummaryText = (correct: number, total: number): string =>
  `You answered ${correct} of ${total} ${total === 1 ? 'question' : 'questions'} correctly.`

/** How a Notion went in the session: a glyph and a word, the tone only adds to them. */
export interface NotionOutcomeMark {
  glyph: string
  label: string
  tone: 'mastered' | 'attention'
}

export function notionOutcomeMark(correct: number, asked: number): NotionOutcomeMark {
  if (correct >= asked) return { glyph: '✓', label: 'All correct', tone: 'mastered' }
  return { glyph: '!', label: correct === 0 ? 'Missed' : 'Some missed', tone: 'attention' }
}
