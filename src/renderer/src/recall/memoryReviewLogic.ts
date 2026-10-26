import type { MemoryReviewView, RecallStart } from '../../../shared/recall'

/** The Notions of the needs-attention group: what "Start a recall quiz on these" practices. */
export const attentionNotionIds = (view: MemoryReviewView): number[] =>
  view.groups.needs_attention.map((entry) => entry.notion.id)

/** How a request to start a Practice ended. */
export type PracticeRequest =
  | { kind: 'started'; start: RecallStart }
  /** Nothing to practice yet (Notions of Topics not passed yet, no question). Expected. */
  | { kind: 'empty' }
  /** The call itself failed. */
  | { kind: 'failed' }

/**
 * Starts a Practice on the given Notions. Practice never traps the learner: a null answer ("empty")
 * and a failure ("failed") each give the screen a calm message of their own. An empty list is not
 * sent, because the service reads it as "no Notion" and has nothing to ask.
 */
export async function requestPractice(
  start: (request: { notionIds?: number[] }) => Promise<RecallStart | null>,
  notionIds: number[]
): Promise<PracticeRequest> {
  if (notionIds.length === 0) return { kind: 'empty' }
  try {
    const started = await start({ notionIds })
    return started ? { kind: 'started', start: started } : { kind: 'empty' }
  } catch (reason) {
    console.warn('Could not start the Practice:', reason)
    return { kind: 'failed' }
  }
}
