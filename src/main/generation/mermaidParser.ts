// mermaid's own parser in the main process (Electron main, or Node under Vitest): no DOM. Loaded
// on first use by `parseDiagramSource` (diagrams.ts), in its own chunk of the main bundle.
// mermaid and dompurify stay external in the main build (package dependencies), so both resolve
// to the same node_modules modules at run time. No app import: the chunk loads on its own (the
// build smoke check requires it directly).

/** A parser that resolves when it accepts a source and rejects (or throws) otherwise. */
export type MermaidParse = (source: string) => unknown

/**
 * mermaid sanitizes labels with DOMPurify, which without a DOM is built without its methods:
 * they are stubbed on the instance mermaid imports (`dompurify` is a direct dependency so it is
 * one module for both). Nothing is rendered or inserted anywhere here, only parsed; the renderer
 * keeps the real DOMPurify. Null when mermaid cannot be loaded.
 */
export async function loadMermaidParser(limits: {
  maxTextSize: number
  maxEdges: number
}): Promise<MermaidParse | null> {
  try {
    const { default: purify } = await import('dompurify')
    if (typeof purify.addHook !== 'function') {
      Object.assign(purify, {
        addHook() {},
        removeHook() {},
        removeHooks() {},
        removeAllHooks() {},
        sanitize: (text: unknown) => String(text)
      })
    }
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      logLevel: 'fatal',
      ...limits
    })
    return (source: string) => mermaid.parse(source)
  } catch (error) {
    console.error('Mermaid parser unavailable: diagrams are only checked statically', error)
    return null
  }
}
