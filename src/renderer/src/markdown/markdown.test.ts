import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DIAGRAM_FIXTURES, STREAMING_FIXTURE } from '../dev/diagramFixtures'
import {
  DIAGRAM_LIMITS,
  checkDiagramSource,
  codeBlockKind,
  cssSafeId,
  diagramErrorFromException,
  diagramKey,
  diagramLabel,
  diagramNodeCount,
  diagramTitleOf,
  diagramTypeOf,
  findFences,
  isFenceClosed,
  planDiagram,
  svgMinWidth,
  warnDiagramOnce,
  withSvgId
} from './diagramSource'
import { MarkdownContent } from './MarkdownContent'
import { MermaidDiagram } from './MermaidDiagram'

const render = (markdown: string, streaming = false) =>
  renderToStaticMarkup(createElement(MarkdownContent, { markdown, streaming }))

const flowchart = 'flowchart LR\n  A[Client] --> B[Server]'

describe('fence detection', () => {
  it('tells closed fences from open ones', () => {
    expect(isFenceClosed('```mermaid\nflowchart LR\n  A --> B\n```')).toBe(true)
    expect(isFenceClosed('```mermaid\nflowchart LR\n  A --> B\n```\n')).toBe(true)
    expect(isFenceClosed('~~~~mermaid\nA\n~~~~~')).toBe(true)
    expect(isFenceClosed('```mermaid\nflowchart LR\n  A --> B')).toBe(false)
    expect(isFenceClosed('```mermaid\nflowchart LR\n``')).toBe(false)
    expect(isFenceClosed('````mermaid\nA\n```')).toBe(false)
    expect(isFenceClosed('```mermaid')).toBe(false)
    expect(isFenceClosed('> ```mermaid\n> A --> B\n> ```')).toBe(true)
    expect(isFenceClosed('    indented code')).toBe(true)
  })

  it('finds fences in streamed partial content', () => {
    const cut = STREAMING_FIXTURE.indexOf('App->>DB')
    expect(findFences(STREAMING_FIXTURE.slice(0, cut))).toEqual([
      { lang: 'mermaid', content: expect.stringContaining('Cache-->>App: miss'), closed: false }
    ])
    expect(findFences(STREAMING_FIXTURE)).toEqual([
      { lang: 'mermaid', content: expect.stringContaining('App->>Cache: SET clé'), closed: true }
    ])
    expect(findFences('text\n```js\nx\n```\n```Mermaid\nA')).toEqual([
      { lang: 'js', content: 'x', closed: true },
      { lang: 'mermaid', content: 'A', closed: false }
    ])
  })

  it('shows the placeholder while a streamed fence is open, then the diagram', () => {
    const partial = render(STREAMING_FIXTURE.slice(0, STREAMING_FIXTURE.indexOf('App->>DB')), true)
    expect(partial).toContain('data-kind="loading"')
    expect(partial).toContain('Diagram loading…')
    expect(partial).not.toContain('could not be drawn')
    expect(partial).not.toContain('<pre>')
    // The text before the block is already there.
    expect(partial).toContain('<h2>Cache-aside</h2>')

    const closed = render(STREAMING_FIXTURE, true)
    expect(closed).toContain('data-kind="render"')
    expect(closed).toContain('Le cache ne contient donc')

    // Once the stream has ended, an unclosed fence is final: it is drawn, not left waiting.
    const ended = render('```mermaid\n' + flowchart, false)
    expect(ended).toContain('data-kind="render"')
  })

  it('hides a streamed fence opening that may become a diagram', () => {
    const open = { fenceClosed: false, streaming: true }
    expect(codeBlockKind('', '', open)).toBe('pending')
    expect(codeBlockKind('mer', '', open)).toBe('pending')
    expect(codeBlockKind('js', '', open)).toBe('code')
    expect(codeBlockKind('', 'some code', open)).toBe('code')
    expect(codeBlockKind('', '', { fenceClosed: false, streaming: false })).toBe('code')
    expect(codeBlockKind('Mermaid', '', { fenceClosed: true, streaming: false })).toBe('diagram')

    const before = STREAMING_FIXTURE.indexOf('```mermaid')
    for (const cut of [3, 6]) {
      const html = render(STREAMING_FIXTURE.slice(0, before + cut), true)
      expect(html, `cut ${cut}`).not.toContain('<pre')
      expect(html).not.toContain('diagram')
    }
    expect(render(STREAMING_FIXTURE.slice(0, before + 11), true)).toContain('data-kind="loading"')
  })

  it('keeps other code blocks as code', () => {
    const html = render('```js\nconst a = 1\n```\n\n```\nplain\n```')
    expect(html).toContain('<pre><code class="language-js">const a = 1\n</code></pre>')
    expect(html).toContain('<pre><code>plain\n</code></pre>')
    expect(html).not.toContain('diagram')
  })

  it('renders mermaid blocks inside lists', () => {
    const html = render('- step\n\n  ```mermaid\n  flowchart LR\n    A --> B\n  ```\n', true)
    expect(html).toContain('data-kind="render"')
  })
})

describe('checkDiagramSource', () => {
  it('accepts every supported fixture and refuses the failing ones', () => {
    for (const fixture of DIAGRAM_FIXTURES) {
      const check = checkDiagramSource(fixture.source)
      // The invalid-syntax fixture passes the checks: mermaid's parser refuses it.
      expect(check.ok, fixture.id).toBe(!fixture.fails || fixture.id === 'invalid')
    }
  })

  it('refuses interactions, scripts, HTML and directives', () => {
    const code = (source: string) => {
      const check = checkDiagramSource(source)
      return check.ok ? 'ok' : check.error.code
    }
    expect(code('flowchart LR\n  A --> B\n  click A callback')).toBe('forbidden_content')
    expect(code('flowchart LR\n  A --> B; click B "https://x"')).toBe('forbidden_content')
    expect(code('flowchart LR\n  A["<script>alert(1)</script>"]')).toBe('forbidden_content')
    expect(code('flowchart LR\n  A["javascript:alert(1)"]')).toBe('forbidden_content')
    expect(code('flowchart LR\n  A["x<br/>y"] --> B')).toBe('forbidden_content')
    expect(code('%%{init: {"theme": "dark"}}%%\nflowchart LR\n  A --> B')).toBe('forbidden_content')
    expect(code('---\nconfig:\n  theme: dark\n---\nflowchart LR\n  A --> B')).toBe(
      'forbidden_content'
    )
    // Not HTML: class annotations, ER cardinalities, arrows, labels mentioning a click.
    expect(code('classDiagram\n  class A {\n    <<interface>>\n  }\n  A <|-- B')).toBe('ok')
    expect(code('erDiagram\n  A ||--o{ B : has')).toBe('ok')
    expect(code('flowchart LR\n  A[User click] --> B')).toBe('ok')
    expect(code('---\ntitle: Lecture\n---\nflowchart LR\n  A --> B')).toBe('ok')
  })

  it('enforces the size, line and node limits', () => {
    const code = (source: string) => {
      const check = checkDiagramSource(source)
      return check.ok ? 'ok' : check.error.code
    }
    expect(code(`flowchart LR\n  A["${'x'.repeat(DIAGRAM_LIMITS.maxChars)}"]`)).toBe('too_large')
    const lines = Array.from({ length: DIAGRAM_LIMITS.maxStatements + 1 }, () => '  A --> B')
    expect(code(`flowchart LR\n${lines.join('\n')}`)).toBe('too_large')
    const chain = Array.from({ length: DIAGRAM_LIMITS.maxNodes }, (_, i) => `  N${i} --> N${i + 1}`)
    expect(code(`flowchart LR\n${chain.join('\n')}`)).toBe('too_many_nodes')
    expect(code('')).toBe('parse_error')
    expect(code('pie\n  "a" : 1')).toBe('unsupported_type')
  })

  it('counts nodes and reads the type and title', () => {
    expect(
      diagramNodeCount('flowchart LR\n  A[x] --> B & C\n  B -- label --> D\n  subgraph S\n  end')
    ).toBe(5)
    expect(
      diagramNodeCount(
        'sequenceDiagram\n  participant A\n  A->>B: hi\n  B-->>C: ok\n  Note over A: n'
      )
    ).toBe(3)
    expect(diagramNodeCount('erDiagram\n  A ||--o{ B : has')).toBe(0)
    expect(diagramTypeOf('%% comment\n\ngraph TD\n  A --> B')).toBe('graph')
    expect(diagramTypeOf('---\ntitle: T\n---\nsequenceDiagram')).toBe('sequenceDiagram')
    expect(diagramTitleOf('flowchart LR\n  accTitle: Read path\n  A --> B')).toBe('Read path')
    expect(diagramTitleOf('---\ntitle: "Write path"\n---\nflowchart LR')).toBe('Write path')
    expect(diagramTitleOf(flowchart)).toBeNull()
  })
})

describe('planDiagram and fallback', () => {
  it('waits only while a streamed fence is open', () => {
    expect(planDiagram(flowchart, { fenceClosed: false, streaming: true })).toEqual({
      kind: 'loading'
    })
    expect(planDiagram(flowchart, { fenceClosed: false, streaming: false }).kind).toBe('render')
    expect(planDiagram(flowchart, { fenceClosed: true, streaming: true }).kind).toBe('render')
  })

  it('falls back with a typed error on refused sources', () => {
    const plan = planDiagram('flowchart LR\n  A --> B\n  click A cb')
    expect(plan).toMatchObject({ kind: 'fallback', error: { code: 'forbidden_content' } })
  })

  it('renders the fallback as a code block with a note, never throwing', () => {
    const html = renderToStaticMarkup(createElement(MermaidDiagram, { source: 'pie\n  "a" : 1' }))
    expect(html).toContain('data-kind="fallback"')
    expect(html).toContain('This diagram could not be drawn.')
    expect(html).toContain('<code class="language-mermaid">pie\n  &quot;a&quot; : 1</code>')
  })

  it('shows a placeholder before the first render, with an optional caption', () => {
    const html = renderToStaticMarkup(
      createElement(MermaidDiagram, { source: flowchart, caption: 'Read path' })
    )
    expect(html).toContain('data-kind="render"')
    expect(html).toContain('Diagram loading…')
    expect(html).toContain('<figcaption>Read path</figcaption>')
  })

  it('reduces mermaid errors to their first line', () => {
    expect(
      diagramErrorFromException('parse_error', new Error('\nParse error on line 2:\n...A -->>'))
    ).toEqual({ code: 'parse_error', message: 'Parse error on line 2:' })
    expect(
      diagramErrorFromException(
        'parse_error',
        new Error("Parse error on line 2:\n...A -->> B\n------^\nExpecting 'SQE', got 'PS'")
      ).message
    ).toBe("Parse error on line 2: Expecting 'SQE', got 'PS'")
    expect(diagramErrorFromException('timeout', 'x'.repeat(300)).message).toHaveLength(200)
  })

  it('warns once per distinct failure', () => {
    const warn = vi.fn()
    const error = { code: 'parse_error' as const, message: 'bad' }
    expect(warnDiagramOnce('k1', error, warn)).toBe(true)
    expect(warnDiagramOnce('k1', error, warn)).toBe(false)
    expect(warnDiagramOnce('k1', { ...error, code: 'timeout' }, warn)).toBe(true)
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('memo keys and ids', () => {
  it('keys a source by its normalized text', () => {
    expect(diagramKey(flowchart)).toBe(diagramKey(`\n${flowchart.replace('\n', '\r\n')}   \n`))
    expect(diagramKey(flowchart)).not.toBe(diagramKey(flowchart.replace('Server', 'Serveur')))
    expect(diagramKey(flowchart)).toMatch(/^[0-9a-f]+$/)
  })

  it('keeps the plan stable while the text after a closed block streams', () => {
    const block = '```mermaid\n' + flowchart + '\n```\n'
    const keyOf = (markdown: string) => /data-key="([^"]*)"/.exec(render(markdown, true))?.[1]
    const plan = planDiagram(flowchart)
    expect(plan.kind === 'render' && plan.key).toBe(diagramKey(flowchart))
    // The rendered markup is the same diagram whatever follows it.
    expect(render(block + 'Suite', true)).toContain('data-kind="render"')
    expect(keyOf(block)).toBe(keyOf(block + 'Suite du texte'))
  })

  it('makes SVG ids unique per instance and CSS safe', () => {
    expect(cssSafeId('«r1»')).toBe('r1')
    expect(cssSafeId('_r_1_')).toBe('_r_1_')
    expect(
      withSvgId('<svg id="mermaid-k"><style>#mermaid-k .a{}</style>', 'mermaid-k', 'd-1')
    ).toBe('<svg id="d-1"><style>#d-1 .a{}</style>')
  })

  it('computes the minimum width and the label', () => {
    expect(svgMinWidth('<svg viewBox="0 0 1000 200">')).toBe(700)
    expect(svgMinWidth('<svg viewBox="-8 -8 250.5 90">')).toBe(175)
    expect(svgMinWidth('<svg>')).toBeNull()
    expect(diagramLabel('erDiagram')).toBe('Diagram (entity relationship diagram), source below')
    expect(diagramLabel('flowchart', 'Read path')).toBe('Diagram: Read path')
  })
})
