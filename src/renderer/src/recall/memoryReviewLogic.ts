import type { MemoryReviewView, RecallStart } from '../../../shared/recall'

/** The Notions of the needs-attention group: what "Start a recall quiz on these" practices. */
export const attentionNotionIds = (view: MemoryReviewView): number[] =>
  view.groups.needs_attention.map((entry) => entry.notion.id)

/**
 * Starts a Practice on the given Notions. Null when there is nothing to practice yet (Notions of
 * Topics not passed yet, no question) and also when the call fails: Practice never traps the
 * learner, the screen shows a calm message either way. An empty list is not sent, because the
 * service reads it as "no Notion" and has nothing to ask.
 */
export async function requestPractice(
  start: (request: { notionIds?: number[] }) => Promise<RecallStart | null>,
  notionIds: number[]
): Promise<RecallStart | null> {
  if (notionIds.length === 0) return null
  try {
    return await start({ notionIds })
  } catch {
    return null
  }
}
