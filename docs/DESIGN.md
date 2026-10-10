---
name: Terminal Architect
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#c0c1ff'
  on-secondary: '#1000a9'
  secondary-container: '#3131c0'
  on-secondary-container: '#b0b2ff'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  code-inline:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.01em
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels an authoritative, developer-native aesthetic inspired by the precision engineering of Linear, the tactile utility of Raycast, and the clarity of Stripe’s technical documentation. It addresses senior software engineers, distributed systems architects, and technical interview candidates who demand high-density information without visual noise.

The visual style blends **Technical Minimalism** with **Tactile Utility**:
- **Tone:** Methodical, sharp, hyper-focused, and premium.
- **Visual Tenets:** Deep zinc and obsidian backgrounds, crisp hairline structural borders (1px), subtle luminous status accents, and strict typographic hierarchy.
- **Atmosphere:** Evokes a state-of-the-art IDE and technical cockpit where progress, state transitions, and complex multi-region architecture diagrams emerge with effortless legibility.

## Colors

The palette is engineered around dark surfaces with precise functional status signaling:

- **Surface & Canvas:**
  - `canvas-default`: `#06080d` (ultra-deep void for base canvas)
  - `surface-base`: `#0b0f19` (primary module and section layer)
  - `surface-elevated`: `#111827` (cards, floating command palettes, panels)
  - `surface-subtle`: `#1f2937` (hover states, segmented controller troughs)

- **Structural Boundaries:**
  - `border-hairline`: `rgba(255, 255, 255, 0.08)` (subtle element separation)
  - `border-active`: `rgba(255, 255, 255, 0.18)` (card highlights, focus outlines)
  - `border-focus`: `#6366f1` (keyboard focus rings with `rgba(99, 102, 241, 0.35)` spread)

- **Semantic Role Accents:**
  - **Mastered / Complete (`primary`):** `#10b981` (emerald) paired with `rgba(16, 185, 129, 0.12)` pill fills and soft outer halos.
  - **In-Progress / Current Path (`secondary`):** `#6366f1` (indigo/violet) indicating active reading, interactive canvas checkpoints, and active branches.
  - **Review / Alert (`tertiary`):** `#f59e0b` (amber) reserved for architectural trade-offs, SPOFs (Single Points of Failure), and retry limits.
  - **Locked / Inactive:** `#475569` to `#64748b` on `rgba(15, 23, 42, 0.6)` surfaces.

- **Typography & Content:**
  - `text-primary`: `#f8fafc` (high-contrast title & body)
  - `text-secondary`: `#94a3b8` (metadata, subheadings, labels)
  - `text-muted`: `#64748b` (footnotes, disabled states, structural glyphs)

## Typography

The typographic stack pairs **Geist** for clean, low-distortion UI reading with **JetBrains Mono** for technical tokens, numeric metadata, and system properties:

- **Hierarchy:** Geist headings use tight negative letter-spacing (`-0.015em` to `-0.03em`) to deliver modern editorial weight without needing extreme boldness.
- **System Metrics & Architecture Data:** Latencies, throughput (e.g., `100k QPS`), cache hit ratios, and partition keys are strictly set in `label-mono` or `label-caps`.
- **Text Blocks:** Long-form architectural walkthroughs and trade-off writeups use `body-lg` at 1.625 line-height (`26px`) for optimal sustained scanning in dark mode.

## Layout & Spacing

The architecture operates on an 8pt base grid with a structured fluid desktop frame:

- **Desktop (1280px+):** Max-width container of `1440px`. Two-tier master layout consisting of a fixed 260px collapsible module navigator, an 800px central prose/curriculum column, and an optional 320px telemetry & system trade-off drawer.
- **Tablet (768px – 1024px):** 12-column grid with 1.25rem gutters; right utility drawers collapse to sheet overlays.
- **Mobile (< 768px):** 4-column layout with strict 16px edges; modules stack into linear sequence streams with sticky bottom navigation.
- **Spatial Rhythm:** Tight inner-component padding (`space-xs` to `space-md`) ensures high computational density, while generous vertical canvas gaps (`space-xl`) separate distinct curriculum phases (e.g., Foundations vs. Case Studies).

## Elevation & Depth

Visual hierarchy does not rely on diffuse, muddy drop shadows. Instead, it leverages **Tonal Layering** and **Hairline Luminescence**:

- **Layer 0 (Canvas Base):** Solid `#06080d`.
- **Layer 1 (Card/Container Surfaces):** Semi-opaque `#0b0f19` over canvas with an inset 1px hairline border: `border: 1px solid rgba(255, 255, 255, 0.07)`.
- **Layer 2 (Overlays & Active Cards):** `#111827` surface with elevated outline `rgba(255, 255, 255, 0.14)` and a directional top highlight: `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.08)`.
- **Layer 3 (Floating Menus / Quick Finders):** Raycast-style backdrop blur (`backdrop-filter: blur(16px)`), `#0b0f19/85%` fill, bordered with `rgba(255, 255, 255, 0.12)`, supported by a dark ambient ground shadow: `0 20px 40px -12px rgba(0, 0, 0, 0.7)`.
- **Glow Accents:** Status badges and active nodes emit a 12px blur halo with 20% opacity matching their semantic token (e.g., `box-shadow: 0 0 12px rgba(16, 185, 129, 0.2)` for mastered nodes).

## Shapes

The design system enforces a **Soft** geometry standard (`roundedness: 1`):

- **Micro elements (tags, badges, inline code, checkboxes):** 4px (`0.25rem`).
- **Standard elements (buttons, text inputs, list items):** 6px (`0.375rem`).
- **Cards, modular sections, diagram canvases:** 8px (`0.5rem`).
- **Modals, spotlight command palettes:** 12px (`0.75rem`).

Pill geometry is reserved exclusively for progress indicator tracks and active status pill pings. All structural framing remains sharp and disciplined to preserve the technical utility feel.

## Components

### Buttons
- **Primary:** High-contrast solid white/slate-100 background (`#f8fafc`) with `#0b0f19` bold text, sharp 6px corners, and subtle hover transition (`opacity: 0.92`).
- **Secondary / Ghost:** Transparent background with hairline border (`rgba(255, 255, 255, 0.12)`), `#f8fafc` text, switching to `rgba(255, 255, 255, 0.06)` background on hover.
- **Action Mono:** Monospaced keyboard shortcut badges appended inside secondary buttons using `label-mono` styling on a `rgba(255, 255, 255, 0.08)` surface.

### Status Chips & Badges
- **Mastered:** `label-caps` in `#10b981` atop `rgba(16, 185, 129, 0.1)` background with `1px solid rgba(16, 185, 129, 0.2)`. Features a 6px glowing dot indicator.
- **In-Progress:** `label-caps` in `#818cf8` atop `rgba(99, 102, 241, 0.12)` with `1px solid rgba(99, 102, 241, 0.25)`.
- **Locked:** Monospaced label in `#64748b` with subtle lock icon, `rgba(255, 255, 255, 0.03)` fill, and `rgba(255, 255, 255, 0.05)` border.

### Cards & Module Containers
- **Foundations & Primer Cards:** Minimalist `#0b0f19` surface with `1px solid rgba(255, 255, 255, 0.07)` border. Hover introduces `border-active` (`rgba(255, 255, 255, 0.18)`) and an interior subtle radial gradient tracking the cursor.
- **Case Study Cards:** Include a top metadata row (QPS rating, partition strategy, complexity indicator) set in `JetBrains Mono`, separated by a structural divider from the title and architecture preview diagram.

### Progress Bars
- **Track:** 4px tall, `#1e293b` background, fully rounded ends.
- **Fill:** Smooth gradient shifting from indigo (`#6366f1`) to emerald (`#10b981`) upon completion, with transition timing curve `cubic-bezier(0.16, 1, 0.3, 1)`.

### Form Controls & Code Inputs
- **Inputs:** Dark `#0b0f19` field with inset border `rgba(255, 255, 255, 0.1)`. Focus produces a crisp `#6366f1` ring without blurring the underlying field boundary.
- **Checkboxes:** 16px square with 3px corner radius. In checked state: solid `#10b981` with crisp white checkmark vector.

### System Diagram Canvas & Telemetry Blocks
- Custom canvas containers feature dark dotted matrix grid backgrounds (`radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px) 16px 16px`), interactive hover inspection tools, and synchronized step-by-step latency telemetry tags.