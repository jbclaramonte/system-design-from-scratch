---
title: Theme
tags: [concept, ui]
issue: [62]
---

# Theme

The look of the app: **Light** ("Warm": peach canvas, white cards with warm shadows, bright terracotta, Plus Jakarta Sans, rounder corners, a tactile primary button) or **Dark** ("Terminal Architect": the original look, Geist, hairline borders). Chosen in Settings, Appearance, as **Theme**: System (the default, follows the operating system), Light or Dark. It changes only how the app looks: never the content, the [[Generation Language]] or any progress.

- **Same meaning in both**: mastered, in progress, attention and error keep their roles; only the hues change (emerald to sage, indigo to terracotta, amber to honey, red to coral, and a cobalt focus ring in light). See [[Design System#Rules for new UI]].
- **No flash**: the main process points Electron's native theme at the setting before it opens the window, so `prefers-color-scheme` already says which look to show; a blocking script copies it to `data-theme` before the first paint. See [[Design System#Themes]].
- **Contrast**: the documented text and surface pairs of both themes are checked by a unit test, see [[Design System#Contrast]].
- **Until #63**: the Design Canvas keeps the dark palette inside the Light theme; Mermaid diagrams and the Design Export are not re-themed yet.

## Related

- Changed in Settings, next to the [[Generation Language]] (also a per-app preference)
- Tokens, fonts and shared classes: [[Design System]]; the visual spec of each theme: `DESIGN.md`

## In code

`Theme` (`system` | `light` | `dark`, default `system`), `resolveTheme` and `themeWindowBackground` in `src/shared/theme.ts`; the `theme` setting in `src/shared/settings.ts` (key `theme`, `getTheme` in `src/main/db/repositories/settings.ts`, validated by `settingsErrors` and the zod schema of `src/main/settings/settingsIpc.ts`); `applyTheme` in `src/main/index.ts` (native theme and window background); `src/renderer/public/theme-init.js` and `src/renderer/src/theme/watchTheme.ts` (`data-theme`); the two token sets in `src/renderer/src/styles/design-tokens.css`; the Settings control in `src/renderer/src/settings/SettingsScreen.tsx`; the contrast test `src/renderer/src/styles/contrast.test.ts`.
