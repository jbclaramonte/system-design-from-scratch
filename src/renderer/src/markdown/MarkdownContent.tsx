import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentPropsWithoutRef
} from 'react'
import Markdown, { type Components, type ExtraProps, type Options } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { codeBlockKind, isFenceClosed, planDiagram, type DiagramErrorEvent } from './diagramSource'
import { DiagramLoading, MermaidDiagram } from './MermaidDiagram'

interface BlockContext {
  markdown: string
  streaming: boolean
  onDiagramError: (event: DiagramErrorEvent) => void
}

const MarkdownBlockContext = createContext<BlockContext>({
  markdown: '',
  streaming: false,
  onDiagramError: () => {}
})

const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url)

// Minimal hast shapes read by the code block component.
interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const textOf = (node: HastNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('')

/** Language (`''` when none) and `<code>` element of a `<pre>`, or null for other content. */
function codeOf(pre: HastNode | undefined): { lang: string; code: HastNode } | null {
  const code = pre?.children?.find((child) => child.type === 'element')
  if (code?.tagName !== 'code') return null
  const classes = code.properties?.['className']
  const lang = (Array.isArray(classes) ? classes : [])
    .map(String)
    .find((name) => name.startsWith('language-'))
  return { lang: lang ? lang.slice('language-'.length) : '', code }
}

/**
 * The code block hook of every Markdown view: a ```mermaid block becomes a Mermaid Diagram
 * (only once its fence is closed while the text streams), any other block stays `<pre>`.
 * Exported for views that call react-markdown with their own components.
 */
export function MarkdownCodeBlock({
  node,
  children,
  ...props
}: ComponentPropsWithoutRef<'pre'> & ExtraProps) {
  const { markdown, streaming, onDiagramError } = useContext(MarkdownBlockContext)
  const block = codeOf(node as HastNode | undefined)
  if (!block) return <pre {...props}>{children}</pre>

  const source = textOf(block.code)
  const start = node?.position?.start.offset
  const end = node?.position?.end.offset
  const fenceClosed =
    start === undefined || end === undefined ? true : isFenceClosed(markdown.slice(start, end))
  const kind = codeBlockKind(block.lang, source, { fenceClosed, streaming })
  if (kind === 'pending') return null
  if (kind === 'code') return <pre {...props}>{children}</pre>
  if (planDiagram(source, { fenceClosed, streaming }).kind === 'loading') {
    return (
      <figure className="diagram" data-testid="diagram" data-kind="loading">
        <DiagramLoading />
      </figure>
    )
  }
  return <MermaidDiagram source={source} onDiagramError={onDiagramError} />
}

/** Components every Markdown view shares; views add theirs on top (see `LessonMarkdown`). */
const baseComponents: Components = {
  pre: MarkdownCodeBlock,
  a: ({ href, children }) =>
    isWebUrl(href) ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Remote images are blocked by the CSP and the prompts ask for none: show the alt.
  img: ({ alt }) => (alt ? <em>[{alt}]</em> : null),
  table: ({ children }) => (
    <div className="lesson-table">
      <table>{children}</table>
    </div>
  )
}

type PluggableList = NonNullable<Options['remarkPlugins']>

const noPlugins: PluggableList = []

export interface MarkdownContentProps {
  markdown: string
  /** True while the text is still streaming: an unclosed ```mermaid block shows a placeholder. */
  streaming?: boolean
  /** Failure of any diagram of the text (see `MermaidDiagram`). */
  onDiagramError?: (event: DiagramErrorEvent) => void
  /** Extra remark plugins, after remark-gfm. Pass a stable array. */
  remarkPlugins?: PluggableList
  /** Extra or overriding components. Pass a stable object (useMemo). */
  components?: Components
}

/**
 * The one Markdown renderer of the app: GFM, Mermaid Diagrams, no raw HTML (`skipHtml`), links
 * only to http(s) URLs (the main process opens them in the OS browser), images as their alt.
 */
export const MarkdownContent = memo(function MarkdownContent({
  markdown,
  streaming = false,
  onDiagramError,
  remarkPlugins = noPlugins,
  components
}: MarkdownContentProps) {
  const callback = useRef(onDiagramError)
  useLayoutEffect(() => {
    callback.current = onDiagramError
  })
  const reportDiagramError = useCallback(
    (event: DiagramErrorEvent) => callback.current?.(event),
    []
  )
  const context = useMemo(
    () => ({ markdown, streaming, onDiagramError: reportDiagramError }),
    [markdown, streaming, reportDiagramError]
  )
  const plugins = useMemo(() => [remarkGfm, ...remarkPlugins], [remarkPlugins])
  const merged = useMemo(() => ({ ...baseComponents, ...components }), [components])

  return (
    <MarkdownBlockContext.Provider value={context}>
      <Markdown remarkPlugins={plugins} components={merged} skipHtml>
        {markdown}
      </Markdown>
    </MarkdownBlockContext.Provider>
  )
})
