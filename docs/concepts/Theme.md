---
title: Theme
tags: [concept, ui]
issue: [62, 63]
---

# Theme

The look of the app: **Light** ("Warm": peach canvas, white cards with warm shadows, bright terracotta, Plus Jakarta Sans, rounder corners, a tactile primary button) or **Dark** ("Terminal Architect": the original look, Geist, hairline borders). Chosen in Settings, Appearance, as **Theme**: System (the default, follows the operating system), Light or Dark. It changes only how the app looks: never the content, the [[Generation Language]] or any progress.

- **Same meaning in both**: mastered, in progress, attention and error keep their roles; only the hues change (emerald to sage, indigo to terracotta, amber to honey, red to coral, and a cobalt focus ring in light). See [[Design System#Rules for new UI]].
- **No flash**: the main process points Electron's native theme at the setting before it opens the window, so `prefers-color-scheme` already says which look to show; a blocking script copies it to `data-theme` before the first paint. See [[Design System#Themes]].
- **Contrast**: the documented text and surface pairs of both themes are checked by a unit test, see [[Design System#Contrast]].
- **Third-party content follows too** (#63): Mermaid diagrams are redrawn in the colors of the Theme (also when it changes while one is on screen), and the Design Canvas draws its components, notes, groups and arrows for it. The [[Design Export]] PNG does not: it stays dark strokes on opaque white whatever the Theme. See [[Design System#Third-party content on a themed app]].
- **The website** shows the app in its Light theme and follows that look ([[Website]]).

## Related

- Changed in Settings, next to the [[Generation Language]] (also a per-app preference)
- Tokens, fonts and shared classes: [[Design System]]; the visual spec of each theme: `DESIGN.md`

## In code

`Theme` (`system` | `light` | `dark`, default `system`), `resolveTheme` and `themeWindowBackground` in `src/shared/theme.ts`; the `theme` setting in `src/shared/settings.ts` (key `theme`, `getTheme` in `src/main/db/repositories/settings.ts`, validated by `settingsErrors` and the zod schema of `src/main/settings/settingsIpc.ts`); `applyTheme` in `src/main/index.ts` (native theme and window background); `src/renderer/public/theme-init.js` and `src/renderer/src/theme/watchTheme.ts` (`data-theme`); the two token sets in `src/renderer/src/styles/design-tokens.css`; the Settings control in `src/renderer/src/settings/SettingsScreen.tsx`; the contrast test `src/renderer/src/styles/contrast.test.ts`; `useResolvedTheme` (`src/renderer/src/theme/useResolvedTheme.ts`) for what takes its colors from JavaScript, Mermaid (`markdown/mermaidTheme.ts`) and the Design Canvas (`design/flow/flowTheme.ts`).
