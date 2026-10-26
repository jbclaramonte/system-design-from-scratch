/** Copy of the Memory Review screen: plain counts and dates, calm wording, no verdict. */

export const missedOfText = (missed: number, of: number): string => `Missed ${missed} of last ${of}`

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole calendar days (local time) from `from` to `to`; DST changes do not skew it. */
const calendarDays = (from: Date, to: Date): number =>
  Math.round(
    (new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      DAY_MS
  )

/** "Last seen today", "yesterday", "3 days ago", from the ISO time of the latest answer. */
export function lastSeenText(iso: string | null, now: Date): string {
  const seen = iso === null ? null : new Date(iso)
  if (seen === null || Number.isNaN(seen.getTime())) return 'Not seen yet'
  const days = Math.max(0, calendarDays(seen, now))
  if (days === 0) return 'Last seen today'
  if (days === 1) return 'Last seen yesterday'
  return `Last seen ${days} days ago`
}

/** The accessible name of one of the latest results: a word, the color only adds to it. */
export const resultMarkLabel = (correct: boolean): string => (correct ? 'Correct' : 'Missed')

export const footnoteText =
  'Based on the latest 6 answers per notion. Declared Mastery and Forced Unlock never count.'

export const emptyTitle = 'Nothing to review yet'
export const emptyText =
  'A notion appears here after you have answered a couple of questions on it in different quizzes. Keep going on the Learning Path, and this page fills in by itself.'

export const noAttentionText = 'Nothing needs attention right now.'
export const startUnavailableText = 'Available when a notion needs attention.'

/** The calm message of a Practice that has no question to ask (not an error). */
export const practiceEmptyText = (scope: 'notion' | 'notions'): string =>
  scope === 'notion'
    ? 'Nothing to practice yet for this notion. Questions come from Topics you have already passed.'
    : 'Nothing to practice yet for these notions. Questions come from Topics you have already passed.'

/** A Practice that could not start (the call failed), as opposed to having nothing to ask. */
export const practiceFailedText = 'Could not start the practice. Try again in a moment.'

/** The Memory Review could not be loaded: calm, with a retry; the raw error stays in the console. */
export const loadFailedText = 'Could not load the Memory review. Nothing is lost: try again.'

export const openTopicFailedText = 'Could not open the lesson section. Try again in a moment.'
