---
title: Design System
tags: [ui, architecture]
issue: 28
---

# Design System

Tokens, fonts and shared base styles of the renderer. The visual spec is `DESIGN.md` ("Terminal Architect": technical minimalism, dark theme only, hairline borders, luminous status accents); this note says how it is implemented and how to use it. Screen redesigns build on it: app shell, Learning Path, Dashboard, Topic, Quiz, Design Exercise.

> [!note] Scope
> Only what exists in the app is styled. No streak, search, keyboard shortcut badges or fake telemetry (see the issue reference).

## Files

| File | Role |
|---|---|
| `src/renderer/src/styles/design-tokens.css` | CSS custom properties on `:root` (`color-scheme: dark`). The only source of colors, radii, spacing, type scale, elevation and motion. |
| `src/renderer/src/styles/base.css` | Reset, element styles (headings, links, focus ring, scrollbars, code, tables, form controls, buttons) and the small shared classes (`.btn-*`, `.chip`, `.card`, `.progress`, text helpers). |
| `src/renderer/src/styles/components.css` | Patterns shared by several screens: page header, notices, status strip, stat, note card, status marks, card table, card disclosure, tabs, clickable card. See [[#Shared patterns]]. |
| `src/renderer/src/main.tsx` | Import order: fonts, `design-tokens.css`, `base.css`, `components.css`, then `App` (which imports the screen stylesheets). The order matters: shared rules come before screen rules, so a screen rule of equal specificity can adjust spacing in its own context. |
| `src/renderer/src/shell/` | The app shell: `AppShell.tsx`, `shell.css`, `navigation.ts` (screens, nav items, layouts; tested). See [[#App shell]]. |
| `src/renderer/src/*/*.css` | Screen styles next to their components, using tokens only. |

> [!warning] File name
> The tokens file is `design-tokens.css`, not `tokens.css`: a `Read(tokens.*)` deny rule in the user's Claude Code settings blocks a file with that exact name.

## Fonts

Geist (UI text) and JetBrains Mono (labels, code, numeric metadata) come from `@fontsource-variable/geist` and `@fontsource-variable/jetbrains-mono`, imported from `main.tsx` (`wght.css`, variable weight axis). Family names: `Geist Variable` and `JetBrains Mono Variable`, exposed as `--font-sans` and `--font-mono` with system fallbacks. No network at runtime: the built renderer runs from `file://`, where Chromium refuses font URLs, so `electron.vite.config.ts` inlines every `@fontsource-variable` file as a `data:` URL (the CSP allows `font-src 'self' data:`). Licenses (OFL-1.1): [[Attribution and Licenses#Fonts]].

## Tokens

Names below drop the `--` prefix families: `--color-*`, `--radius-*`, `--space-*`, `--type-*`, `--shadow-*`, `--glow-*`.

| Group | Tokens |
|---|---|
| Surfaces | `color-canvas` #06080d (layer 0), `color-surface-base` #0b0f19 (layer 1), `color-surface-elevated` #111827 (layer 2), `color-surface-subtle` #1f2937 (hover, troughs), `color-surface-overlay` (layer 3 fill), `color-track` #1e293b |
| Borders | `color-border-hairline` .08, `-card` .07, `-control` .12, `-input` .10, `-elevated` .14, `-active` .18 (white alphas), `color-border-focus` #6366f1, `color-focus-ring` indigo .35 |
| Text | `color-text-primary` #f8fafc, `color-text-secondary` #94a3b8, `color-text-muted` #64748b, `color-on-primary` #0b0f19 |
| Mastered (emerald) | `color-mastered` #10b981, `-text`, `-fill` .12, `-border` .25 |
| In progress (indigo) | `color-progress` #6366f1, `-text` #818cf8, `-fill` .12, `-border` .25 |
| Attention (amber) | `color-attention` #f59e0b, `-text` #fbbf24, `-fill` .12, `-border` .28 |
| Locked (slate) | `color-locked` #64748b, `-fill` .03, `-border` .05 |
| Error, Round Limit reached (red) | `color-error` #f87171, `-text`, `-fill`, `-border`. Not in the Colors section of `DESIGN.md`; derived from the same alpha pattern. |
| Other colors | `color-link`, `color-hover`, `color-pressed`, `color-selection`, `color-code-inline`, `color-heat-*` (Notion Map, Okabe-Ito), `color-paper` (light surfaces, e.g. exports) |
| Radii | `radius-sm` 4px (tags, badges, inline code, checkboxes), `-md` 6px (buttons, inputs, list rows), `-lg` 8px (cards, sections), `-xl` 12px (modals), `-pill` (progress tracks only) |
| Spacing | `space-2xs` .125rem, `-xs` .25, `-sm` .5, `-md` 1, `-lg` 1.5, `-xl` 2.5rem; `gutter`, `gutter-sm`, `margin` |
| Type | `font-sans`, `font-mono`, and `type-<style>-{size,line,tracking,weight}` for headline-xl/lg/md/sm, body-lg/md/sm, code-inline, code-block, label-mono, label-caps |
| Elevation | `shadow-layer-2` (inset top highlight), `shadow-layer-3` + `blur-layer-3` (floating menus), `glow-mastered/progress/attention` |
| Motion | `ease-out` cubic-bezier(.16, 1, .3, 1), `duration-fast`, `duration-slow` |
| Progress | `progress-height` 4px, `progress-gradient` indigo to emerald |
| Layout | `layout-max-width` 1100px (shell container), `layout-header-height` 3.5rem, `layout-reading-width` 48rem (quiz reading column) |

Text contrast: `text-primary` and `text-secondary` pass WCAG AA on every surface. `text-muted` is about 4.1:1 on the canvas, so use it for footnotes and structural glyphs only.

## Element defaults

Plain markup looks right without a class: `body` (Geist 14px/22px on the canvas), `h1` to `h6` (tight negative letter-spacing, scale from `headline-lg`), `a` (indigo, underline offset), `code` and `pre` (JetBrains Mono, elevated surface), `table` (hairline rules), `input`, `textarea`, `select` (surface-base field, indigo focus ring), `input[type=checkbox|radio]` (emerald `accent-color`), `button` (secondary style: transparent, hairline border, 6px radius, hover fill, disabled at 45%). Focus ring: 2px indigo outline plus a 35% indigo spread (`:focus-visible`). Scrollbars are thin and translucent. Text selection is indigo.

## Shared classes

| Class | Use |
|---|---|
| `.btn` | Gives a link or any element the button look. A plain `button` already has it. |
| `.btn-primary` | Solid #f8fafc, dark bold text; one per view for the main action. Hover at 92% opacity. |
| `.btn-ghost`, `.btn-sm` | Borderless variant; compact size. |
| `.chip` + variant | Status badge: JetBrains Mono caps 10px, 4px radius. Variants: `.chip-mastered`, `.chip-progress`, `.chip-attention`, `.chip-locked`, `.chip-error`; none = neutral. Add `.chip-dot` for the 6px glowing dot. Mapping: Mastered to `chip-mastered`, In progress to `chip-progress`, Skipped and warnings to `chip-attention`, Locked to `chip-locked`, Round Limit reached and errors to `chip-error`. A status never relies on color alone: the label text stays. |
| `.card` | Layer 1: surface-base, 1px card border, 8px radius, 1rem padding. |
| `.card-elevated` | Layer 2: surface-elevated, stronger border, inset top highlight. |
| `.card-interactive` | Hover raises the border to `border-active` (use on `a`, `button` or `div` cards). |
| `.progress` > `.progress-fill` | 4px pill track, indigo-to-emerald fill (set `width` inline); `.progress-complete` on the track turns the fill emerald. |
| `.label-caps`, `.label-mono` | Metadata in JetBrains Mono: latencies, counts, partition keys, section labels. |
| `.muted`, `.faint` | Secondary text (`text-secondary`) and footnote text (`text-muted`). |

Screen stylesheets only lay a screen out (grids, columns, sticky bars). A look that two screens share is a shared class, not a copy.

## Shared patterns

Issue #36. All in `components.css`. Tones are named after the status colors: `mastered`, `progress`, `attention`, `error` (plus `neutral` or none).

| Class | Use |
|---|---|
| `.page-header` | Header of a page screen: `h1` on the left, a small Back button (`btn-sm`) on the right, 1.5rem below. Dashboard, Settings, About. |
| `.screen-nav` | Topic screens: a compact Back button with an arrow, then the `h1`, optional aside at the end. `.screen-fill` makes a screen fill the content area height (flex column, `min-height: 0`). |
| `.reading-column` | Centered column, `layout-reading-width` (48rem) wide. Quiz picker, player, results and the quiz screen head. Lesson prose (`.lesson-body`) is 50rem on purpose. |
| `.notice` | One message in a tinted box (6px radius). Plain is information. `.notice-error` for errors (Settings, Dashboard, Design Exercise), `.notice-attention` for a flag or a fallback, `.notice-success` for a confirmation ("Saved": inline, check mark in front). |
| `.notice-card` | Titled notice with actions and folded details: `GenerationErrorView`. `.notice-card-error` adds the red tint and the "!" mark before the title. |
| `.status-strip` | A call in progress: indigo-tinted strip with a `.spinner` (or a dot), the step in progress (`.status-strip-text` grows) and a `btn-sm` Cancel pushed right. Lesson, Remediation Lesson, round preparation, grading, Protocol calls. The spinner slows down under `prefers-reduced-motion`. |
| `.stat` | A `.label-caps` label over a mono `.stat-value`, with an optional `.stat-detail`. Size on the stat: default `headline-sm`, `.stat-md`, `.stat-lg`, `.stat-xl`. Dashboard overview, Learning Path counters, topic header, quiz score. Dividers between stats stay in the screen. |
| `.chip-row` | Chips (and small controls) on one wrapping line, 0.5rem apart. |
| `.note-card` | A `.label-caps` title over text or a list, on `surface-base`. `.note-card-compact` (tighter), `.note-card-attention`, `.note-card-progress` (tinted; the label takes the tone). Quiz explanation notes, Protocol "Next". |
| `.status-mark` | The 20px circle before a title, with `.status-mark-ring`, `-glyph`, `-dot` parts; tone `.status-mark-mastered`, `-progress`, `-attention`, `-error`, `-neutral` (default locked). Decorative: the chip says the status in words. |
| `.mark-row` | A bordered row with `.mark-row-glyph`, `.mark-row-text` and `.mark-row-chips`. Tone `.mark-row-mastered`, `-attention`, `-error`; `.mark-row-outline` for the correct answer left unpicked. Quiz choices and expected points. |
| `.card-table` | A table in a card: put `.card .card-flush` (no padding, scrolls sideways) on the wrapper and `.card-table` on the table. Mono caps header, rules between rows, 1rem on the outer sides of the first and last cells. Dashboard topics and history, quiz notion scores. |
| `.card-disclosure` | A `details` framed like a card; its open summary gets a rule below. `.card-disclosure-inset` for a fold inside a card (canvas color, 6px radius). Dashboard history, About folds, Protocol submissions. |
| `.tabs` > `.tab` | Underline filter tabs: buttons marked with `aria-pressed="true"` or `aria-selected="true"`. Learning Path filter. |
| `.card-clickable` | A card that opens something as a whole. First child `.card-clickable-main` (a button that stretches over the card, or a `div` with `aria-disabled="true"`); inner actions carry `.card-clickable-action` to stay clickable above it. Hover raises the border; the focus ring is drawn around the card. Learning Path steps. |

Focus on a heading set by script (`tabindex="-1"` on a screen, question or panel heading, for screen readers) gets a thin 1px indigo outline at 4px offset without the glow; it only shows when the focus came from the keyboard. Buttons, links and fields keep the full ring.

`lesson-*` classes belong to the Lesson: `.lesson-screen`, `.lesson-header`, `.lesson-notions`, `.lesson-sources` for the Lesson screen, and the prose classes `.lesson-body`, `.lesson-scroll`, `.lesson-table`, `.lesson-notion-anchor`, used wherever a Lesson text is shown (topic screen panel, Remediation Lesson, Protocol Step Lesson).

## App shell

Issue #29. `AppShell` (`src/renderer/src/shell/AppShell.tsx`, `shell.css`) wraps every screen from `App`. It fills the window (`height: 100vh`, flex column): header, content area, footer. Only the content area scrolls, so the header is always in view.

- **Header**: `layout-header-height` high, `surface-base` with a hairline bottom border. Brand mark (inline SVG, decorative) and "System Design" with a muted "from Scratch"; navigation on the right. The brand is not a heading: each screen owns its `h1` (the Learning Path renders its own visible "Learning Path" `h1`).
- **Navigation** (`NAV_ITEMS` in `shell/navigation.ts`): Learning Path, Dashboard, Settings, About, with `data-testid` `open-learning-path`, `open-dashboard`, `open-settings`, `open-about`. The first item is the Learning Path home screen (the mock-up says "Curriculum", which the glossary forbids). The active item has `aria-current="page"` and a raised style (hover fill, control border, primary text); others are secondary text with a transparent border. Focus uses the global focus ring.
- **Active item**: `activeNavItem(screen)` (pure, tested). Topic screens and exercises keep Learning Path; a topic opened from the Dashboard keeps Dashboard; Settings opened from an error highlights Settings (its back button still returns to the screen it came from); dev screens keep Learning Path.
- **Content container**: `layout-max-width` (1100px) centered, `gutter` side padding. Screens render their own `<main>` and must not add page-level padding, a page-level max width or `height: 100vh`.
- **Layouts** (`screenLayout(screen)`, `data-layout` on the shell):

| Layout | Screens | Behavior |
|---|---|---|
| `page` | Learning Path, Dashboard, Settings, About | Centered container; the content flows and the content area scrolls. |
| `fill` | Topic (and the dev lesson screens) | Centered container; the screen fills the height (`flex: 1; min-height: 0`) and scrolls its own panes. |
| `canvas` | Design Exercise, dev canvas | Full width and height, no padding or max width, content area does not scroll. The screen uses `flex: 1; min-height: 0` (no `position: fixed`). |

- **Footer**: quiet, JetBrains Mono `label-mono`, `text-muted`, shows `Version x` (`data-testid="app-version"`).
- **Scroll**: the content area scrolls back to the top when the screen changes.
- **Developer tools** (dev builds only): the `.app-dev` section under the Learning Path, restyled with tokens (dashed border, mono summary).

To add a screen: add it to the `Screen` union, give it a nav item and a layout in `navigation.ts`, render it in `App`.

## Rules for new UI

1. No literal color, radius, font or shadow in a stylesheet or in `style=`: use a token. Inline `style` only for dynamic values (`width: 42%`).
2. Plain semantic markup first (`button`, `input`, `table`); add a class only for a variant.
3. Backgrounds go canvas, then surface-base, then surface-elevated. Do not stack more than two layers, and separate with a hairline border rather than a shadow.
4. Colors carry meaning: emerald is mastered only, indigo is in progress and focus, amber is trade-offs and attention, red is errors and Round Limit. Do not use them as decoration.
5. Technical values (QPS, percentages, counts) use `label-mono`; prose uses Geist. Lesson prose is `body-lg` (16px/26px).
6. Keep the visible focus ring; never `outline: none` without a replacement.
7. A pattern used by two screens goes to `components.css` and is listed in [[#Shared patterns]]; do not copy it into a screen stylesheet.
8. Update this note and the glossary when a token or shared class is added.

## Design Canvas component colors

The component shapes of the Design Canvas (`design/componentTypes.ts`, `COMPONENT_LOOKS` and the dark palette) keep their colors as data: they are the semantic hues of the Design Export (the LLM reads the type from the color too), not theme tokens. The live canvas uses the dark palette (stroke one step lighter than the light stroke, over a deep tint of the same hue); exports use the light one.

| Type | Light fill | Light stroke | Dark fill | Dark stroke |
|---|---|---|---|---|
| `client` | #f1f5f9 | #475569 | #1e293b | #94a3b8 |
| `cdn` | #ccfbf1 | #0d9488 | #0b2c2b | #2dd4bf |
| `load-balancer` | #dbeafe | #2563eb | #0f2547 | #60a5fa |
| `service` | #e0e7ff | #4f46e5 | #1e1b4b | #818cf8 |
| `cache` | #ffedd5 | #ea580c | #34200f | #fb923c |
| `database` | #dcfce7 | #16a34a | #0d2c1d | #34d399 |
| `queue` | #f3e8ff | #9333ea | #2b1545 | #c084fc |

Labels: `#1d1d1d` on a light fill, the `text-primary` token on the dark canvas. Keep this table in sync with `componentTypes.ts`.

## Third-party content on a dark app

- Mermaid ([[Mermaid Diagrams]]): themed for dark (`markdown/mermaidTheme.ts`, mermaid `base` theme with variables from the token values, checked against `design-tokens.css` by a unit test). Diagrams sit on a layer 1 card with the dotted grid.
- tldraw ([[Design Canvas Integration]]): dark (`colorScheme="dark"`), typed shapes recolored through `componentColors(type, mode)`. The export (PNG and SVG) stays light and opaque on purpose so the LLM reads it reliably.
- Design Export PNG stays light on white by design (`exportDesignPng.ts`), independent of the app theme.
