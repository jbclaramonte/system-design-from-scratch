/** One notion anchor of the Lesson text: its slug and its top, relative to the top of the scroll pane. */
export interface NotionAnchor {
  slug: string
  offset: number
}

/**
 * The notion being read, for the notion list of the topic screen: the last notion whose heading
 * has scrolled above `threshold` (px from the top of the pane). Scrolled to the bottom, the last
 * notion visible in the pane wins, so a short last notion is still reached. Null before the first.
 */
export function activeNotion(
  anchors: readonly NotionAnchor[],
  { threshold, viewport, atBottom }: { threshold: number; viewport: number; atBottom: boolean }
): string | null {
  const limit = atBottom ? viewport : threshold
  let active: string | null = null
  for (const anchor of anchors) {
    if (anchor.offset <= limit) active = anchor.slug
  }
  return active
}
