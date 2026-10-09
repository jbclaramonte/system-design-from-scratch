// Lesson Markdown extensions: inline `[source: <section id>]` citations become source chips and
// `<!-- notion: <slug> -->` markers become hidden notion anchors (formats of the #7 prompts, see
// src/main/generation/prompts/common.ts and lesson.ts).

/** Same pattern as `findCitations` in the main process. */
const CITATION_PATTERN = /\[source:\s*([^\]\s]+)\s*\]/g
const NOTION_MARKER = /^<!--\s*notion:\s*([a-z0-9-]+)\s*-->$/

export type TextSegment = { type: 'text'; value: string } | { type: 'citation'; sectionId: string }

/** Splits text on inline citations, keeping the text around them. */
export function splitCitations(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let last = 0
  for (const match of text.matchAll(CITATION_PATTERN)) {
    if (match.index > last) segments.push({ type: 'text', value: text.slice(last, match.index) })
    segments.push({ type: 'citation', sectionId: match[1]! })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  return segments
}

/** Notion slug of a `<!-- notion: <slug> -->` marker, or null for any other HTML. */
export function notionMarkerSlug(html: string): string | null {
  return NOTION_MARKER.exec(html.trim())?.[1] ?? null
}

/** Chip text of a cited section: its last heading, for example `When to update the cache`. */
export function shortSourceLabel(label: string): string {
  return label.split(' > ').at(-1) ?? label
}

/** HTML element name and attribute of a source chip, read back by the Markdown components. */
export const SOURCE_CHIP_TAG = 'cite'
export const NOTION_ANCHOR_TAG = 'span'

// Minimal mdast shapes: only what the transform touches.
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, unknown> }
}

const citationNode = (sectionId: string): MdNode => ({
  type: 'sourceCitation',
  children: [],
  data: { hName: SOURCE_CHIP_TAG, hProperties: { dataSource: sectionId } }
})

const notionAnchorNode = (slug: string): MdNode => ({
  type: 'notionAnchor',
  children: [],
  data: { hName: NOTION_ANCHOR_TAG, hProperties: { dataNotion: slug } }
})

function transform(node: MdNode): void {
  if (!node.children) return
  node.children = node.children.flatMap((child): MdNode[] => {
    if (child.type === 'text' && child.value !== undefined) {
      return splitCitations(child.value).map((segment) =>
        segment.type === 'text'
          ? { type: 'text', value: segment.value }
          : citationNode(segment.sectionId)
      )
    }
    if (child.type === 'html' && child.value !== undefined) {
      const slug = notionMarkerSlug(child.value)
      // Any other raw HTML is dropped by the renderer (`skipHtml`).
      return slug ? [notionAnchorNode(slug)] : [child]
    }
    transform(child)
    return [child]
  })
}

/** Remark plugin applying the citation and notion marker transforms (code is left as is). */
export function remarkLesson() {
  return (tree: MdNode) => transform(tree)
}
