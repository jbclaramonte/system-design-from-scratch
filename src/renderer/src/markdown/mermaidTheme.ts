import type { MermaidConfig } from 'mermaid'
import type { ResolvedTheme } from '../../../shared/theme'

/**
 * Mermaid themes built from the design tokens (src/renderer/src/styles/design-tokens.css), one per
 * Theme. Mermaid parses its colors itself (it derives shades from them), so it needs solid hex
 * values: the translucent border tokens cannot be used. The values are read from the CSS custom
 * properties at render time; the fallbacks are used when the properties are not available (tests,
 * a stylesheet that did not load, the theme of the page is not the one being drawn) and are
 * checked against the tokens file, for both themes, by a unit test.
 */
export const TOKEN_FALLBACKS = {
  dark: {
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
  },
  light: {
    '--color-canvas': '#fff8f5',
    '--color-surface-base': '#ffffff',
    '--color-surface-elevated': '#fcf2eb',
    '--color-surface-subtle': '#f6ece6',
    '--color-track': '#f0e6e0',
    '--color-text-primary': '#1f1b17',
    '--color-text-secondary': '#584237',
    '--color-text-muted': '#6f5a4d',
    '--color-progress': '#ea580c',
    '--color-progress-text': '#a83208',
    '--color-attention': '#f59e0b',
    '--color-attention-text': '#92400e',
    '--color-mastered': '#10b981',
    '--color-error': '#e5484d',
    '--font-sans':
      "'Plus Jakarta Sans Variable', ui-sans-serif, system-ui, -apple-system, sans-serif"
  }
} as const satisfies Record<ResolvedTheme, Record<string, string>>

export type ThemeToken = keyof (typeof TOKEN_FALLBACKS)['dark']

/** Reads one custom property from the root element; empty when unavailable. */
export type TokenReader = (name: ThemeToken) => string

/**
 * Reads the tokens of `theme` from the document. Only while the page shows that theme: when it
 * shows the other one (a switch happened since the diagram was asked for) the properties would
 * hold the other theme's values, so nothing is read and the fallbacks apply.
 */
export const readDocumentToken =
  (theme: ResolvedTheme): TokenReader =>
  (name) =>
    typeof document === 'undefined' || document.documentElement.dataset['theme'] !== theme
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Font family of the diagrams: the app's UI font (the same text as the lessons around them). */
export function diagramFontFamily(
  theme: ResolvedTheme,
  read: TokenReader = readDocumentToken(theme)
): string {
  return read('--font-sans') || TOKEN_FALLBACKS[theme]['--font-sans']
}

/**
 * Mermaid `themeVariables` (theme `base`) for a Theme: nodes on the elevated layer with a muted
 * border, primary text, secondary-text lines, the in-progress color as the one accent (activations,
 * notes). Covers the five supported types: flowchart, sequence, class, state and ER diagrams.
 * Dark: slate on near-black with indigo. Light: peach and white with terracotta.
 */
export function mermaidThemeVariables(
  theme: ResolvedTheme,
  read: TokenReader = readDocumentToken(theme)
): NonNullable<MermaidConfig['themeVariables']> {
  const t = (name: ThemeToken) => read(name) || TOKEN_FALLBACKS[theme][name]
  const surface = t('--color-surface-base')
  const node = t('--color-surface-elevated')
  const subtle = t('--color-surface-subtle')
  const border = t('--color-text-muted')
  const line = t('--color-text-secondary')
  const text = t('--color-text-primary')
  const accent = t('--color-progress-text')
  const accentFill = t('--color-track')

  return {
    darkMode: theme === 'dark',
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
