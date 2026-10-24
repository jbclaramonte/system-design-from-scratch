---
title: Design System
tags: [ui, architecture]
issue: [28, 62, 63]
---

# Design System

Tokens, fonts and shared base styles of the renderer. The visual spec is `DESIGN.md`: two [[Theme]]s, Dark ("Terminal Architect": technical minimalism, hairline borders, luminous status accents) and Light ("Warm": peach canvas, white cards, terracotta, warm shadows); this note says how they are implemented and how to use them. Screen redesigns build on it: app shell, Learning Path, Dashboard, Topic, Quiz, Design Exercise.

> [!note] Scope
> Only what exists in the app is styled. No streak, search, keyboard shortcut badges or fake telemetry (see the issue reference).

## Files

| File | Role |
|---|---|
| `src/renderer/src/styles/design-tokens.css` | CSS custom properties: the shared ones (spacing, type scale, motion, layout) on `:root`, then one block per theme, dark on `:root, [data-theme='dark']` and light on `:root[data-theme='light'], [data-theme='light']`. The only source of colors, radii, fonts, elevation, spacing, type scale and motion. See [[#Themes]]. |
| `src/renderer/src/styles/contrast.test.ts` | The WCAG contrast of the documented text and surface pairs of both themes, computed from `design-tokens.css`. See [[#Contrast]]. |
| `src/renderer/public/theme-init.js`, `src/renderer/src/theme/watchTheme.ts` | Set `data-theme` before the first paint, then keep it up to date. See [[#Themes]]. |
| `src/renderer/src/styles/base.css` | Reset, element styles (headings, links, focus ring, scrollbars, code, tables, form controls, buttons) and the small shared classes (`.btn-*`, `.chip`, `.card`, `.progress`, text helpers). |
| `src/renderer/src/styles/components.css` | Patterns shared by several screens: page header, notices, status strip, stat, note card, status marks, card table, card disclosure, tabs, clickable card. See [[#Shared patterns]]. |
| `src/renderer/src/main.tsx` | Import order: fonts, `design-tokens.css`, `base.css`, `components.css`, then `App` (which imports the screen stylesheets). The order matters: shared rules come before screen rules, so a screen rule of equal specificity can adjust spacing in its own context. |
| `src/renderer/src/shell/` | The app shell: `AppShell.tsx`, `shell.css`, `navigation.ts` (screens, nav items, layouts; tested). See [[#App shell]]. |
| `src/renderer/src/*/*.css` | Screen styles next to their components, using tokens only. |

> [!warning] File name
> The tokens file is `design-tokens.css`, not `tokens.css`: a `Read(tokens.*)` deny rule in the user's Claude Code settings blocks a file with that exact name.

## Fonts

Geist (UI text of the Dark theme), Plus Jakarta Sans (UI text of the Light theme) and JetBrains Mono (labels, code, numeric metadata, both themes) come from `@fontsource-variable/geist`, `@fontsource-variable/plus-jakarta-sans` and `@fontsource-variable/jetbrains-mono`, imported from `main.tsx` (`wght.css`, variable weight axis). Family names: `Geist Variable`, `Plus Jakarta Sans Variable` and `JetBrains Mono Variable`. `--font-mono` is shared; `--font-sans` is set per theme (Geist in dark, Plus Jakarta Sans in light), each with system fallbacks.

> [!note] Plus Jakarta Sans
> The Light theme's UI font (issue #62). `@fontsource-variable/plus-jakarta-sans` is imported in `main.tsx` like the other two and inlined as `data:` URLs by the same `assetsInlineLimit` rule; its OFL-1.1 text is in `resources/licenses.json` (About screen). The Mermaid fallbacks (`TOKEN_FALLBACKS`) hold the sans font of each theme (#63), and the website self-hosts the same three fonts ([[Website]]).

## Tokens

Names below drop the `--` prefix families: `--color-*`, `--radius-*`, `--space-*`, `--type-*`, `--shadow-*`, `--glow-*`. Every theme defines the same set of names (a unit test checks it); the values differ.

| Group | Dark ("Terminal Architect") | Light ("Warm") |
|---|---|---|
| Surfaces | `color-canvas` #06080d (layer 0), `-surface-base` #0b0f19 (layer 1), `-surface-elevated` #111827 (layer 2), `-surface-raised` #111827 (`card-elevated`), `-surface-subtle` #1f2937 (hover, troughs), `-surface-overlay` (layer 3 fill), `-track` #1e293b | `color-canvas` #fff8f5, `-surface-base` #ffffff (cards), `-surface-elevated` #fcf2eb (recessed wells), `-surface-raised` #ffffff (`card-elevated`), `-surface-subtle` #f6ece6, `-surface-overlay` white .88, `-track` #f0e6e0 |
| Borders | `color-border-hairline` .08, `-card` .07, `-control` .12, `-input` .10, `-elevated` .14, `-active` .18 (white alphas), `-focus` #6366f1, `color-focus-ring` indigo .35 | hairline .10, `-control` .22, `-elevated` .16, `-active` .32 (brown alphas `rgba(88, 66, 55, ...)`), `-card` #ecdfd5, `-input` #8a7461 (3:1), `-focus` #2563eb, `color-focus-ring` cobalt .30 |
| Text | `color-text-primary` #f8fafc, `-secondary` #94a3b8, `-muted` #64748b, `color-on-primary` #0b0f19 | `-primary` #1f1b17, `-secondary` #584237, `-muted` #6f5a4d, `color-on-primary` #1f1b17 (dark ink on the orange action) |
| Mastered | `color-mastered` #10b981 (emerald), `-text` #10b981, `-fill` .12, `-border` .25 | `color-mastered` #10b981 (sage), `-text` #05694b, `-fill` .12, `-border` .35 |
| In progress | `color-progress` #6366f1 (indigo), `-text` #818cf8, `-fill` .12, `-border` .25 | `color-progress` #ea580c (terracotta), `-text` #a83208, `-fill` .12 (#f97316 tint), `-border` .38 |
| Attention | `color-attention` #f59e0b (amber), `-text` #fbbf24, `-fill` .12, `-border` .28 | `color-attention` #f59e0b (honey), `-text` #92400e, `-fill` .14, `-border` .40 |
| Locked | `color-locked` #64748b, `-text` #64748b, `-fill` .03, `-border` .05 | `color-locked` #b0a196, `-text` #6f5a4d, `-fill` .05, `-border` .12 |
| Error, Round Limit reached | `color-error` #f87171 (red), `-text` #fca5a5, `-fill` .12, `-border` .28 | `color-error` #e5484d (coral), `-text` #be123c, `-fill` .10, `-border` .35 |
| Primary action | `color-action` #f8fafc, `-hover`, `-active` the same (hover and press dim it: `action-opacity-hover` .92, `-active` .85), flat | `color-action` #f97316, `-hover` #fb923c, `-active` #ea580c (ink text on all three); `shadow-action` (2px bottom edge #c2410c), `shadow-action-pressed` (1px), `action-press-shift` 1px |
| Icon tiles, active navigation | `color-tile-<mastered|progress|attention|neutral>-fill` and `-glyph` (translucent tints), `color-nav-active-fill`, `-border`, `-text` (raised hairline pill) | tiles: mint #d8f3e6, peach #ffe5d4, honey #fdebc4, neutral #f6ece6 with dark glyphs (3:1); navigation: solid #f97316, border #ea580c, ink text |
| Other colors | `color-link` #818cf8, `color-hover`, `-pressed`, `-selection`, `-scrollbar`, `-code-inline` (white alphas), `color-heat-*` (Notion Map, Okabe-Ito, dark untested cells), `color-paper` | `color-link` #a83208 (hover #7c2d12), the same overlays as brown alphas, selection `#f97316` .25, `color-heat-*` (same hues, light untested cells), `color-paper` |
| Radii | `radius-sm` 4px (tags, badges, inline code, checkboxes), `-md` 6px (buttons, inputs, list rows), `-lg` 8px (cards, sections), `-xl` 12px (modals) | 8px, 10px, 14px, 16px |
| Fonts | `font-sans` Geist Variable | `font-sans` Plus Jakarta Sans Variable |
| Elevation | `shadow-card` none, `shadow-layer-2` (inset top highlight), `shadow-layer-3` black, `glow-mastered/progress/attention` 12px at .2 | `shadow-card` and `shadow-layer-2` (warm brown `rgba(124, 66, 30, ...)`, two layers), `shadow-layer-3` brown .3, glows 10px at .25 |
| Progress | `progress-gradient` indigo to emerald | bright terracotta to sage |

Shared by both themes: `radius-pill`, `space-*` (`space-2xs` .125rem, `-xs` .25, `-sm` .5, `-md` 1, `-lg` 1.5, `-xl` 2.5rem; `gutter`, `gutter-sm`, `margin`), `font-mono`, `type-<style>-{size,line,tracking,weight}` (headline-xl/lg/md/sm, body-lg/md/sm, code-inline, code-block, label-mono, label-caps), `blur-layer-3`, `ease-out` cubic-bezier(.16, 1, .3, 1), `duration-fast`, `duration-slow`, `progress-height` 4px, `layout-max-width` 1100px (shell container), `layout-header-height` 3.5rem, `layout-reading-width` 48rem (quiz reading column).

## Themes

The [[Theme]] setting (`system` | `light` | `dark`, default `system`, `src/shared/theme.ts`) is stored with the other settings and applied without a flash:

1. The main process sets Electron's native theme from the setting before it creates the window (`applyTheme` in `src/main/index.ts`): `nativeTheme.themeSource`. `prefers-color-scheme` of the page then already says which look to show (the operating system for System, the choice otherwise), and the window starts on the canvas color of that theme (`themeWindowBackground`, checked against the tokens by a test).
2. `src/renderer/public/theme-init.js`, a classic blocking script in the `<head>` of `index.html` (the CSP allows `script-src 'self'`), copies that media query to `data-theme` on the root element before the first paint. Without it the dark block of the tokens applies.
3. `watchTheme()` (called from `main.tsx`) keeps `data-theme` equal to the media query, so a change in Settings (the main process updates the native theme when the setting is saved) and a change of the operating system under System both apply at once.

The Light values follow what the Stitch mock renders (Material surface tokens: peach page `#fff8f5`, containers `#fcf2eb` to `#eae1da`, solid `#f97316` navigation pill), not the greyer named tokens of the Stitch guidelines (`#faf8f5`, `#f4efea`); see `DESIGN.md`, "Light theme: Warm". Only the primary action differs from the mock: dark ink text instead of white, for AA.

An element with its own `data-theme` re-themes its subtree. Only the off-screen host of the Design Export has one (`dark`, `EXPORT_TOKENS_THEME`): its stylesheet rules read tokens (font, sizes, radii) and the PNG must not depend on the Theme of the app (#63). The Design Canvas has none: it follows the Theme.

What takes its colors from JavaScript (Mermaid, the Design Canvas nodes and arrows) reads the active theme with `useResolvedTheme()` (`src/renderer/src/theme/useResolvedTheme.ts`: `data-theme` of the root element, observed, so it changes with `watchTheme`). See [[#Third-party content on a themed app]].

Rules for a style that depends on the theme: never test the theme in a screen stylesheet; add a token to both blocks of `design-tokens.css` (the test fails when the two sets of names differ) and use `var(--...)`. The few rules that differ by token value only (the tactile primary button, the card shadow) are written once in `base.css` against tokens.

## Contrast

`contrast.test.ts` computes the WCAG ratio of the documented pairs from `design-tokens.css`, translucent fills drawn over the surface they sit on, and fails below the minimum. Fix a token, never the test.

- **4.5:1 (AA text), both themes:** `text-primary` and `text-secondary` on every surface; each accent `-text` on its own fill over the canvas, the cards and the recessed surface; links; `on-primary` on every action color; the active navigation item text; the heat grid texts. In the Light theme also `text-muted` on every surface and `locked-text` on its fill.
- **3:1 (large text, UI), both themes:** the focus color and the selected-tab color on the canvas and the cards; the glyph of each icon tile on its tile. **Light only:** the input border on every surface (the five surfaces of the theme).
- **Exceptions (Dark theme, frozen):** `text-muted` and the locked chip text are about 4.1:1 on the canvas: footnotes and structural glyphs only. The hairline input border of the Dark theme is not tested. The solid status colors (sage `#10b981` is 2.5:1 on white) are dots, rings and fills that always sit next to a word: the status text uses the `-text` colors.

## Element defaults

Plain markup looks right without a class: `body` (Geist 14px/22px on the canvas), `h1` to `h6` (tight negative letter-spacing, scale from `headline-lg`), `a` (link color, underline offset), `code` and `pre` (JetBrains Mono, elevated surface), `table` (hairline rules), `input`, `textarea`, `select` (surface-base field, focus ring), `input[type=checkbox|radio]` (mastered `accent-color`), `button` (secondary style: transparent, hairline border, 6px radius, hover fill, disabled at 45%). Focus ring: 2px outline plus a translucent spread (`:focus-visible`), indigo in the Dark theme and cobalt in the Light one. Scrollbars are thin and translucent. Text selection takes the in-progress color.

## Shared classes

| Class | Use |
|---|---|
| `.btn` | Gives a link or any element the button look. A plain `button` already has it. |
| `.btn-primary` | The `color-action` fill with `color-on-primary` bold text; one per view for the main action. Dark: solid #f8fafc, hover at 92% opacity. Light: bright terracotta #f97316 with dark ink text and a bottom edge, lighter on hover, deeper and 1px lower when pressed. |
| `.btn-ghost`, `.btn-sm` | Borderless variant; compact size. |
| `.chip` + variant | Status badge: JetBrains Mono caps 10px, 4px radius. Variants: `.chip-mastered`, `.chip-progress`, `.chip-attention`, `.chip-locked`, `.chip-error`; none = neutral. Add `.chip-dot` for the 6px glowing dot. Mapping: Mastered to `chip-mastered`, In progress to `chip-progress`, Skipped and warnings to `chip-attention`, Locked to `chip-locked`, Round Limit reached and errors to `chip-error`. A status never relies on color alone: the label text stays. |
| `.card` | Layer 1: surface-base, 1px card border, `radius-lg`, 1rem padding, `shadow-card` (none in dark, a soft warm shadow in light). |
| `.card-elevated` | Layer 2: surface-raised, stronger border, `shadow-layer-2` (inset top highlight in dark, a stronger warm shadow in light). |
| `.card-interactive` | Hover raises the border to `border-active` (use on `a`, `button` or `div` cards). |
| `.progress` > `.progress-fill` | 4px pill track, gradient fill (indigo to emerald, terracotta to sage in light; set `width` inline); `.progress-complete` on the track turns the fill to the mastered color. |
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
| `.status-strip` | A call in progress: in-progress-tinted strip with a `.spinner` (or a dot), the step in progress (`.status-strip-text` grows) and a `btn-sm` Cancel pushed right. Lesson, Remediation Lesson, round preparation, grading, Protocol calls. The spinner slows down under `prefers-reduced-motion`. |
| `.stat` | A `.label-caps` label over a mono `.stat-value`, with an optional `.stat-detail`. Size on the stat: default `headline-sm`, `.stat-md`, `.stat-lg`, `.stat-xl`. Dashboard overview, Learning Path counters, topic header, quiz score. Dividers between stats stay in the screen. |
| `.chip-row` | Chips (and small controls) on one wrapping line, 0.5rem apart. |
| `.note-card` | A `.label-caps` title over text or a list, on `surface-base`. `.note-card-compact` (tighter), `.note-card-attention`, `.note-card-progress` (tinted; the label takes the tone). Quiz explanation notes, Protocol "Next". |
| `.status-mark` | The 20px circle before a title, with `.status-mark-ring`, `-glyph`, `-dot` parts; tone `.status-mark-mastered`, `-progress`, `-attention`, `-error`, `-neutral` (default locked). Decorative: the chip says the status in words. |
| `.mark-row` | A bordered row with `.mark-row-glyph`, `.mark-row-text` and `.mark-row-chips`. Tone `.mark-row-mastered`, `-attention`, `-error`; `.mark-row-outline` for the correct answer left unpicked. Quiz choices and expected points. |
| `.card-table` | A table in a card: put `.card .card-flush` (no padding, scrolls sideways) on the wrapper and `.card-table` on the table. Mono caps header, rules between rows, 1rem on the outer sides of the first and last cells. Dashboard topics and history, quiz notion scores. |
| `.card-disclosure` | A `details` framed like a card; its open summary gets a rule below. `.card-disclosure-inset` for a fold inside a card (canvas color, 6px radius). Dashboard history, About folds, Protocol submissions. |
| `.tabs` > `.tab` | Underline filter tabs: buttons marked with `aria-pressed="true"` or `aria-selected="true"`. Learning Path filter. |
| `.card-clickable` | A card that opens something as a whole. First child `.card-clickable-main` (a button that stretches over the card, or a `div` with `aria-disabled="true"`); inner actions carry `.card-clickable-action` to stay clickable above it. Hover raises the border; the focus ring is drawn around the card. Learning Path steps. |

Focus on a heading set by script (`tabindex="-1"` on a screen, question or panel heading, for screen readers) gets a thin 1px focus-colored outline at 4px offset without the glow; it only shows when the focus came from the keyboard. Buttons, links and fields keep the full ring.

`.icon-tile` (components.css) is a 2.5rem rounded square with a glyph, one tone per role from the `color-tile-*` tokens (`-mastered`, `-progress`, `-attention`, neutral by default): the Badges of the Dashboard. `level-*`, `badge-*` and `round-xp-*` classes belong to the rewards UI (`src/renderer/src/rewards/`: the [[Level]] card, the [[Badge]] grid and the XP line of a Round); a locked Badge is a neutral card with a lock and the word "Locked", never red.

`activity-*` classes belong to the Activity card (`src/renderer/src/activity/`, shared by the Learning Path and the Dashboard): the [[Activity Streak]] headline, the week strip and the [[Daily Goal]] bar, built on `.card`, `.chip`, `.progress` and tokens only. Each day of the strip draws a glyph (check, dashed ring, ring, lock) and carries a text alternative, so status is never by color alone.

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

- **First-run screen** (`firstRun/`, #61): shown instead of the whole shell (no header, navigation or banner) until the Generation Language is chosen. A centered `.card` (max 40rem) with a bilingual `h1`, a native radio group of two `.first-run-choice` cards (selected: progress tint and border; the card draws the focus ring through `:has(:focus-visible)`), a bilingual note and a `.btn-primary`. The choices stack under about 30rem. Tokens only.
- **Footer**: quiet, JetBrains Mono `label-mono`, `text-muted`, shows `Version x` (`data-testid="app-version"`).
- **Scroll**: the content area scrolls back to the top when the screen changes.
- **Developer tools** (dev builds only): the `.app-dev` section under the Learning Path, restyled with tokens (dashed border, mono summary).

To add a screen: add it to the `Screen` union, give it a nav item and a layout in `navigation.ts`, render it in `App`.

## Rules for new UI

1. No literal color, radius, font or shadow in a stylesheet or in `style=`: use a token. Inline `style` only for dynamic values (`width: 42%`).
2. Plain semantic markup first (`button`, `input`, `table`); add a class only for a variant.
3. Backgrounds go canvas, then surface-base, then surface-elevated. Do not stack more than two layers, and separate with a hairline border (the tokens add the soft shadow of the Light theme to cards; do not add others).
4. Colors carry meaning, in both themes: mastered is emerald in dark and sage in light; in progress and the primary action are indigo in dark and terracotta in light; attention (trade-offs, flags) is amber, honey in light; errors and Round Limit are red, coral in light; the focus ring is indigo in dark and cobalt in light. Name the role (`color-mastered`, `color-progress`...), never the hue. Do not use them as decoration. Text in a status color uses its `-text` token (AA, see [[#Contrast]]).
5. Technical values (QPS, percentages, counts) use `label-mono`; prose uses Geist. Lesson prose is `body-lg` (16px/26px).
6. Keep the visible focus ring; never `outline: none` without a replacement.
7. A pattern used by two screens goes to `components.css` and is listed in [[#Shared patterns]]; do not copy it into a screen stylesheet.
8. Update this note and the glossary when a token or shared class is added. A token exists in both themes.

## Design Canvas component colors

The component nodes of the Design Canvas (`design/componentTypes.ts`, `COMPONENT_LOOKS` and the dark palette) keep their colors as data: they are the semantic hues of the Design Export (the LLM reads the type from the color too), not theme tokens. Three modes (`ComponentColorMode`): `dark` (the live canvas in the Dark theme: stroke one step lighter than the light stroke, over a deep tint of the same hue), `light` (the live canvas in the Light theme) and `export` (the PNG). `light` and `export` share the fills and strokes of the table, so a type keeps its hue and the canvas looks like its PNG; they differ in the label (`export`: the literal `#1d1d1d`; live modes: the `text-primary` token of the theme).

| Type | Light fill | Light stroke | Dark fill | Dark stroke |
|---|---|---|---|---|
| `client` | #f1f5f9 | #475569 | #1e293b | #94a3b8 |
| `cdn` | #ccfbf1 | #0d9488 | #0b2c2b | #2dd4bf |
| `load-balancer` | #dbeafe | #2563eb | #0f2547 | #60a5fa |
| `service` | #e0e7ff | #4f46e5 | #1e1b4b | #818cf8 |
| `cache` | #ffedd5 | #ea580c | #34200f | #fb923c |
| `database` | #dcfce7 | #16a34a | #0d2c1d | #34d399 |
| `queue` | #f3e8ff | #9333ea | #2b1545 | #c084fc |

Keep this table in sync with `componentTypes.ts`; `flowTheme.test.ts` checks the strokes against the canvas of each theme (3:1), the labels against their fills (4.5:1), and that the seven strokes stay apart.

## Third-party content on a themed app

- Mermaid ([[Mermaid Diagrams]]): one theme per Theme (`markdown/mermaidTheme.ts`, mermaid `base` theme with variables from the token values of the Theme shown, checked against both blocks of `design-tokens.css` by a unit test). A diagram is drawn once per Theme and redrawn in place when the Theme changes. Diagrams sit on a layer 1 card with the dotted grid, in both themes.
- React Flow ([[Design Canvas Integration]]): `colorMode` follows the Theme, and `flowCanvas.css` maps React Flow's `--xy-*` variables to tokens (one mapping serves both themes; only the dotted grid is tuned per theme). Edges, notes and groups use `FLOW_PALETTES.dark` or `.light`, which name tokens (`var(--token)`), so they follow the tokens by themselves; typed components are recolored through `componentColors(type, mode)`, which needs the mode from JavaScript.
- Design Export PNG stays light on opaque white by design (`export/exportDesignPng.tsx`), independent of the app theme: the `export` mode has literal colors only (`FLOW_PALETTES.export`), and its host is pinned to the dark tokens for the font, sizes and radii its stylesheet reads. Checked in the built app, byte for byte, in both themes (see [[Design Export]]).
