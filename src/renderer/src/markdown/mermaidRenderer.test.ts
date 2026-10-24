import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for mermaid that records how it was configured and draws the theme into the SVG.
const calls = vi.hoisted(() => ({
  initialize: [] as { darkMode?: boolean; fontFamily?: string }[]
}))
vi.mock('mermaid', () => {
  let darkMode = false
  return {
    default: {
      initialize: (config: { darkMode?: boolean; fontFamily?: string }) => {
        calls.initialize.push(config)
        darkMode = config.darkMode ?? false
      },
      parse: async () => true,
      render: async () => ({ svg: `<svg data-dark="${darkMode}"></svg>` })
    }
  }
})

describe('renderDiagram', () => {
  beforeEach(() => {
    calls.initialize.length = 0
    vi.resetModules()
  })

  it('draws a diagram once per theme, with mermaid configured for that theme', async () => {
    const { renderDiagram, peekRenderedDiagram } = await import('./mermaidRenderer')
    expect(peekRenderedDiagram('k', 'dark')).toBeUndefined()

    const dark = await renderDiagram('flowchart TD\nA-->B', 'k', 'dark')
    expect(dark).toEqual({ ok: true, svg: '<svg data-dark="true"></svg>' })
    expect(peekRenderedDiagram('k', 'dark')).toBe(dark)
    expect(peekRenderedDiagram('k', 'light')).toBeUndefined()

    const light = await renderDiagram('flowchart TD\nA-->B', 'k', 'light')
    expect(light).toEqual({ ok: true, svg: '<svg data-dark="false"></svg>' })
    expect(calls.initialize.map((config) => config.darkMode)).toEqual([true, false])
    expect(calls.initialize[0]?.fontFamily).toContain('Geist Variable')
    expect(calls.initialize[1]?.fontFamily).toContain('Plus Jakarta Sans Variable')
  })

  it('reuses what it drew for a theme it already knows', async () => {
    const { renderDiagram } = await import('./mermaidRenderer')
    const first = await renderDiagram('flowchart TD\nA-->B', 'k', 'light')
    await renderDiagram('flowchart TD\nC-->D', 'other', 'light')
    expect(await renderDiagram('flowchart TD\nA-->B', 'k', 'light')).toBe(first)
    // Back to a theme drawn before: the cache answers, mermaid is not configured again for it.
    await renderDiagram('flowchart TD\nA-->B', 'k', 'dark')
    expect(await renderDiagram('flowchart TD\nA-->B', 'k', 'dark')).toEqual({
      ok: true,
      svg: '<svg data-dark="true"></svg>'
    })
    expect(calls.initialize.map((config) => config.darkMode)).toEqual([false, true])
  })
})
