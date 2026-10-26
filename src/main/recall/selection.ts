/**
 * Picks the questions of a Recall Quiz: weighted sampling without replacement, favoring Notions
 * that need attention and questions not asked for a while. Pure: the clock and the random source
 * are injected, like the clock in src/main/activity/activity.ts.
 *
 * weight = (1 + 3 if a Notion needs attention, or 1 if it is steadier) x (1 + min(days since the
 * question was last asked / 7, 3)); a question never asked counts as the maximum, 3, so it is not
 * penalized. A question with several Notions uses the highest status weight among them.
 */
import type { NotionRecallStatus } from './memory'

export interface RecallCandidate {
  questionId: number
  topicId: number
  notionIds: readonly number[]
  /** `new` for a question never asked (from a recall batch), `reused` for an earlier one. */
  origin: 'reused' | 'new'
  /** ISO 8601 time of the latest Attempt on the question, null if never asked. */
  lastAskedAt: string | null
}

const DEFAULT_SIZE = 6
const DEFAULT_MAX_NEW = 3
const MS_PER_DAY = 86_400_000
const STATUS_WEIGHT = { needs_attention: 4, steadier: 2, solid: 1, untracked: 1 } as const
const MAX_AGE_BONUS = 3

function weight(
  candidate: RecallCandidate,
  status: ReadonlyMap<number, NotionRecallStatus | 'untracked'>,
  now: Date
): number {
  const statusWeight = Math.max(
    1,
    ...candidate.notionIds.map((id) => STATUS_WEIGHT[status.get(id) ?? 'untracked'])
  )
  const ageBonus =
    candidate.lastAskedAt === null
      ? MAX_AGE_BONUS
      : Math.min(
          Math.max(now.getTime() - Date.parse(candidate.lastAskedAt), 0) / MS_PER_DAY / 7,
          MAX_AGE_BONUS
        )
  return statusWeight * (1 + ageBonus)
}

/** Draws up to `count` candidates, each draw proportional to weight, without replacement. */
function sample(
  pool: readonly RecallCandidate[],
  count: number,
  weigh: (candidate: RecallCandidate) => number,
  random: () => number
): RecallCandidate[] {
  const remaining = pool.map((candidate) => ({ candidate, weight: weigh(candidate) }))
  const drawn: RecallCandidate[] = []
  while (drawn.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0)
    let target = random() * total
    let index = remaining.findIndex((entry) => (target -= entry.weight) < 0)
    if (index === -1) index = remaining.length - 1
    const [entry] = remaining.splice(index, 1)
    if (entry === undefined) break
    drawn.push(entry.candidate)
  }
  return drawn
}

/** Question ids in play order: new questions first (at most `maxNew`), then reused ones. */
export function selectRecallQuestions(input: {
  candidates: readonly RecallCandidate[]
  status: ReadonlyMap<number, NotionRecallStatus | 'untracked'>
  now: Date
  random: () => number
  size?: number
  maxNew?: number
}): number[] {
  const { status, now, random, size = DEFAULT_SIZE, maxNew = DEFAULT_MAX_NEW } = input
  const unique = [...new Map(input.candidates.map((c) => [c.questionId, c])).values()]
  const weigh = (candidate: RecallCandidate) => weight(candidate, status, now)

  const fresh = sample(
    unique.filter((c) => c.origin === 'new'),
    Math.min(maxNew, size),
    weigh,
    random
  )
  const reused = sample(
    unique.filter((c) => c.origin === 'reused'),
    size - fresh.length,
    weigh,
    random
  )
  return [...fresh, ...reused].map((candidate) => candidate.questionId)
}
