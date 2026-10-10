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
| `src/renderer/src/styles/base.css` | Reset, element styles (headings, links, focus ring, scrollbars, code, tables, form controls, buttons) and the shared classes below. |
| `src/renderer/src/main.tsx` | Import order: fonts, `design-tokens.css`, `base.css`, then `App` (which imports the screen stylesheets). The order matters: base rules must come before screen rules. |
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
| Other colors | `color-link`, `color-hover`, `color-pressed`, `color-selection`, `color-code-inline`, `color-heat-*` (Notion Map, Okabe-Ito), `color-paper` (see below) |
| Radii | `radius-sm` 4px (tags, badges, inline code, checkboxes), `-md` 6px (buttons, inputs, list rows), `-lg` 8px (cards, sections), `-xl` 12px (modals), `-pill` (progress tracks only) |
| Spacing | `space-2xs` .125rem, `-xs` .25, `-sm` .5, `-md` 1, `-lg` 1.5, `-xl` 2.5rem; `gutter`, `gutter-sm`, `margin` |
| Type | `font-sans`, `font-mono`, and `type-<style>-{size,line,tracking,weight}` for headline-xl/lg/md/sm, body-lg/md/sm, code-inline, code-block, label-mono, label-caps |
| Elevation | `shadow-layer-2` (inset top highlight), `shadow-layer-3` + `blur-layer-3` (floating menus), `glow-mastered/progress/attention` |
| Motion | `ease-out` cubic-bezier(.16, 1, .3, 1), `duration-fast`, `duration-slow` |
| Progress | `progress-height` 4px, `progress-gradient` indigo to emerald |

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

Existing screen classes (`.path-badge`, `.mastery-badge`, `.lesson-badge`, `.dash-card`, `.path-progress`) already use the tokens with the same looks. Issues #29 to #34 should migrate them to the shared classes above.

## Rules for new UI

1. No literal color, radius, font or shadow in a stylesheet or in `style=`: use a token. Inline `style` only for dynamic values (`width: 42%`).
2. Plain semantic markup first (`button`, `input`, `table`); add a class only for a variant.
3. Backgrounds go canvas, then surface-base, then surface-elevated. Do not stack more than two layers, and separate with a hairline border rather than a shadow.
4. Colors carry meaning: emerald is mastered only, indigo is in progress and focus, amber is trade-offs and attention, red is errors and Round Limit. Do not use them as decoration.
5. Technical values (QPS, percentages, counts) use `label-mono`; prose uses Geist. Lesson prose is `body-lg` (16px/26px).
6. Keep the visible focus ring; never `outline: none` without a replacement.
7. Update this note and the glossary when a token or shared class is added.

## Third-party content on a dark app

- Mermaid ([[Mermaid Diagrams]]): the Mermaid theme is configured for a light background (`mermaidRenderer.ts`). Diagrams therefore sit on a light `color-paper` card (`.diagram-scroll`) and stay readable. A dark Mermaid theme is a separate task.
- tldraw ([[Design Canvas Integration]]): the editor keeps its own light theme (`tldraw/tldraw.css`) inside the canvas; the component shapes use light fills with dark text. The palette column and surrounding screen use tokens. Dark canvas theming is a separate task.
- Design Export PNG stays light on white by design (`exportDesignPng.ts`), independent of the app theme.
