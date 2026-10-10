import type { MermaidConfig } from 'mermaid'

/**
 * Dark Mermaid theme built from the design tokens (src/renderer/src/styles/design-tokens.css).
 * Mermaid parses its colors itself (it derives shades from them), so it needs solid hex values:
 * the translucent border tokens cannot be used. The values are read from the CSS custom
 * properties at render time; the fallbacks are used when the properties are not available (tests,
 * a stylesheet that did not load) and are checked against the tokens file by a unit test.
 */
export const TOKEN_FALLBACKS = {
  '--color-canvas': '#06080d',
  '--color-surface-base': '#0b0f19',
  '--color-surface-elevated': '#111827',
  '--color-surface-subtle': '#1f2937',
  '--color-track': '#1e293b',
  '--color-text-primary': '#f8fafc',
  '--color-text-secondary': '#94a3b8',
  '--color-text-muted': '#64748b',
  '--color-progress': '#6366f1',
  '--color-progress-text': '#818cf8',
  '--color-attention': '#f59e0b',
  '--color-attention-text': '#fbbf24',
  '--color-mastered': '#10b981',
  '--color-error': '#f87171',
  '--font-sans': "'Geist Variable', ui-sans-serif, system-ui, -apple-system, sans-serif"
} as const

export type ThemeToken = keyof typeof TOKEN_FALLBACKS

/** Reads one custom property from the root element; empty when unavailable. */
export type TokenReader = (name: ThemeToken) => string

/** Reads the tokens from the document, if there is one. */
export const readDocumentToken: TokenReader = (name) =>
  typeof document === 'undefined'
    ? ''
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Font family of the diagrams: the app's UI font (the same text as the lessons around them). */
export function diagramFontFamily(read: TokenReader = readDocumentToken): string {
  return read('--font-sans') || TOKEN_FALLBACKS['--font-sans']
}

/**
 * Mermaid `themeVariables` (theme `base`) for the dark surface: nodes on the elevated layer with
 * a slate border, primary text, secondary-text lines, indigo as the one accent (activations,
 * notes), amber for notes' text frame. Covers the five supported types: flowchart, sequence,
 * class, state and ER diagrams.
 */
export function mermaidThemeVariables(
  read: TokenReader = readDocumentToken
): NonNullable<MermaidConfig['themeVariables']> {
  const t = (name: ThemeToken) => read(name) || TOKEN_FALLBACKS[name]
  const surface = t('--color-surface-base')
  const node = t('--color-surface-elevated')
  const subtle = t('--color-surface-subtle')
  const border = t('--color-text-muted')
  const line = t('--color-text-secondary')
  const text = t('--color-text-primary')
  const accent = t('--color-progress-text')
  const accentFill = t('--color-track')

  return {
    darkMode: true,
    fontFamily: t('--font-sans'),
    fontSize: '14px',
    background: surface,

    // Generic: every diagram type derives its shades from these.
    primaryColor: node,
    primaryTextColor: text,
    primaryBorderColor: border,
    secondaryColor: subtle,
    secondaryTextColor: text,
    secondaryBorderColor: border,
    tertiaryColor: surface,
    tertiaryTextColor: text,
    tertiaryBorderColor: border,
    lineColor: line,
    textColor: text,
    mainBkg: node,
    nodeBorder: border,
    nodeTextColor: text,
    titleColor: text,
    // Flat like the rest of the app (layers are separated by hairlines, not shadows).
    dropShadow: 'none',

    // Flowchart.
    clusterBkg: surface,
    clusterBorder: border,
    edgeLabelBackground: surface,
    defaultLinkColor: line,

    // Sequence diagram.
    actorBkg: node,
    actorBorder: border,
    actorTextColor: text,
    actorLineColor: border,
    signalColor: line,
    signalTextColor: text,
    labelBoxBkgColor: node,
    labelBoxBorderColor: border,
    labelTextColor: text,
    loopTextColor: text,
    activationBkgColor: accentFill,
    activationBorderColor: accent,
    sequenceNumberColor: surface,
    noteBkgColor: accentFill,
    noteBorderColor: accent,
    noteTextColor: text,

    // Class diagram.
    classText: text,

    // State diagram.
    stateBkg: node,
    stateLabelColor: text,
    compositeBackground: surface,
    compositeBorder: border,
    compositeTitleBackground: node,
    altBackground: subtle,
    transitionColor: line,
    transitionLabelColor: text,
    specialStateColor: line,
    innerEndBackground: border,

    // ER diagram.
    attributeBackgroundColorOdd: node,
    attributeBackgroundColorEven: surface,
    rowOdd: node,
    rowEven: surface,
    entityBkg: node
  }
}
