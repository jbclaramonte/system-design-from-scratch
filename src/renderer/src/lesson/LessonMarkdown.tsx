import { memo, useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { LessonSource } from '../../../shared/lesson'
import { remarkLesson, shortSourceLabel } from './citations'

const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url)

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

const plugins = [remarkGfm, remarkLesson]

/**
 * Renders lesson Markdown (GFM tables, code blocks) with source chips. Raw HTML is never
 * rendered (`skipHtml`) and links only open http(s) URLs, in the OS browser.
 */
export const LessonMarkdown = memo(function LessonMarkdown({
  markdown,
  sources
}: {
  markdown: string
  sources: LessonSource[]
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
      },
      a: ({ href, children }) =>
        isWebUrl(href) ? (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ) : (
          <span>{children}</span>
        ),
      // Remote images are blocked by the CSP and the lesson prompt asks for none: show the alt.
      img: ({ alt }) => (alt ? <em>[{alt}]</em> : null),
      table: ({ children }) => (
        <div className="lesson-table">
          <table>{children}</table>
        </div>
      )
    }
  }, [sources])

  return (
    <Markdown remarkPlugins={plugins} components={components} skipHtml>
      {markdown}
    </Markdown>
  )
})
