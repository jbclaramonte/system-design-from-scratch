import { memo, useMemo } from 'react'
import type { Components } from 'react-markdown'
import type { LessonSource } from '../../../shared/lesson'
import type { DiagramErrorEvent } from '../markdown/diagramSource'
import { MarkdownContent } from '../markdown/MarkdownContent'
import { remarkLesson, shortSourceLabel } from './citations'

/** Opens a primer permalink: the main process routes http(s) `window.open` to the OS browser. */
const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

export function SourceChip({ sectionId, source }: { sectionId: string; source?: LessonSource }) {
  if (!source) {
    return (
      <cite className="source-chip source-chip-unknown" title="Not one of the lesson's excerpts">
        {sectionId}?
      </cite>
    )
  }
  return (
    <cite className="source-chip">
      <button
        type="button"
        title={`${source.label} (System Design Primer, opens in your browser)`}
        onClick={() => openExternal(source.url)}
      >
        {shortSourceLabel(source.label)}
      </button>
    </cite>
  )
}

const plugins = [remarkLesson]

/**
 * Renders lesson Markdown (lessons, Remediation Lessons, Protocol Step Lessons) through the
 * shared `MarkdownContent` (GFM, Mermaid Diagrams, no raw HTML, http(s) links only), with
 * source chips and notion anchors.
 */
export const LessonMarkdown = memo(function LessonMarkdown({
  markdown,
  sources,
  streaming = false,
  onDiagramError
}: {
  markdown: string
  sources: LessonSource[]
  /** True while the lesson streams (see `MarkdownContent`). */
  streaming?: boolean
  onDiagramError?: (event: DiagramErrorEvent) => void
}) {
  const components = useMemo<Components>(() => {
    const bySection = new Map(sources.map((source) => [source.sectionId, source]))
    return {
      cite: ({ node }) => {
        const sectionId = String(node?.properties['dataSource'] ?? '')
        return <SourceChip sectionId={sectionId} source={bySection.get(sectionId)} />
      },
      span: ({ node, children }) => {
        const notion = node?.properties['dataNotion']
        return notion ? (
          <span className="lesson-notion-anchor" data-notion={String(notion)} />
        ) : (
          <span>{children}</span>
        )
      }
    }
  }, [sources])

  return (
    <MarkdownContent
      markdown={markdown}
      streaming={streaming}
      onDiagramError={onDiagramError}
      remarkPlugins={plugins}
      components={components}
    />
  )
})
