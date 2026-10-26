/**
 * Recall Quiz memory: how well the learner remembers a Notion, from the results of their latest
 * answers. Pure: the caller loads the results (see the window rules in docs/Data Model.md).
 *
 * Status, in this order: fewer than 2 answers is `untracked`; 3 or more missed of the last
 * `RECALL_WINDOW` is `needs_attention`; correct on the last 4 (or on all, if fewer than 4) is
 * `solid`; every other tracked Notion is `steadier`.
 */

/** Number of latest answers per Notion that count. */
export const RECALL_WINDOW = 6

const MISSED_FOR_ATTENTION = 3
const STREAK_FOR_SOLID = 4

export type NotionRecallStatus = 'needs_attention' | 'steadier' | 'solid'

/** `results` are oldest first, `true` meaning correct. */
export function classifyNotion(results: readonly boolean[]): NotionRecallStatus | 'untracked' {
  const window = results.slice(-RECALL_WINDOW)
  if (window.length < 2) return 'untracked'
  if (window.filter((correct) => !correct).length >= MISSED_FOR_ATTENTION) return 'needs_attention'
  if (window.slice(-STREAK_FOR_SOLID).every(Boolean)) return 'solid'
  return 'steadier'
}
