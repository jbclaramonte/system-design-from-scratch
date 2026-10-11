---
title: Design Canvas Integration
tags: [design-practice, architecture]
issue: 12
tldraw-version: 5.5.2
---

# Design Canvas Integration

How the [[Design Canvas]] (tldraw) is embedded in the app and how its [[Design Scene]] is saved per [[Design Exercise]]. Background and license findings: [[tldraw|tldraw spike]].

## Code

| Path | Role |
|---|---|
| `src/renderer/src/design/componentTypes.ts` | Catalogue of component types (`client`, `cdn`, `load-balancer`, `service`, `cache`, `database`, `queue`): labels, colours, default sizes. Pure data. The type list itself lives in `src/shared/designGraph.ts` (re-exported here) so the main process can validate a [[Design Graph]]. |
| `src/renderer/src/design/componentShapes.tsx` | One tldraw `ShapeUtil` per component type (ported from `spikes/tldraw/`): SVG body, editable plain-text label, arrow-binding geometry, SVG export. |
| `src/renderer/src/design/DesignCanvas.tsx` | `<DesignCanvas designExerciseId>`: palette bar plus `<Tldraw>`, loads and autosaves the scene. |
| `src/renderer/src/design/sceneSnapshot.ts` | `serializeScene` / `deserializeScene`: tldraw snapshot to and from stored JSON. |
| `src/renderer/src/design/debouncedSave.ts` | Debounced, ordered autosave. |
| `src/renderer/src/design/assetUrls.ts` | Icon URL helpers (see Offline assets). |
| `src/main/ipc/design.ts` | IPC handlers over the `designPractice` repository. |
| `src/renderer/src/dev/DesignCanvasDevScreen.tsx` | Dev-only screen ("Design canvas (dev)" on the home screen) on a scratch exercise. |

## Persistence

- A [[Design Scene]] is the tldraw editor snapshot (`getSnapshot(editor.store)`: document plus session, so the camera is restored too), stored as JSON in `design_scenes.snapshot`, one row per exercise, overwritten on save. See [[Data Model]].
- IPC (`src/shared/ipc.ts`): `design:loadScene` returns the snapshot or `null`; `design:saveScene` stores it. The main process checks the exercise id and that the snapshot is a JSON object.
- The canvas loads the scene before mounting tldraw and passes it as `snapshot`. A stored value that is not a tldraw snapshot shows an error instead of an empty canvas, so autosave never overwrites it.
- Autosave: every user change to the document marks the scene dirty; the snapshot is taken and saved 500 ms after the last change. Saves run one after the other. Pending changes are flushed when the canvas unmounts and, best effort, on `pagehide` (a change made less than 500 ms before the app quits can be lost).
- `design:openScratchExercise` gets or creates the exercise with slug `dev-scratch`, for the dev screen only. It is rejected in a packaged app.

## License key

- tldraw needs a license key in production (see [[tldraw|spike]]). The renderer passes `import.meta.env.VITE_TLDRAW_LICENSE_KEY` to `<Tldraw licenseKey>` (an empty value counts as no key). Set it in `.env.local` at the repo root (see `.env.example`). It is read at build time and ends up in the renderer bundle, and nowhere else in the package; tldraw keys are designed to be public. How it flows through `npm run package`, expiry of the evaluation key and what to do when the hobby key arrives: [[Packaging#tldraw license]].
- Empty is fine in dev (`npm run dev`, served from `http://localhost`): tldraw shows a "Get a license for production" watermark.
- A production build (`npm run build`, the packaged app: renderer loaded from `file://`) needs a valid key. Without one tldraw stops rendering the editor 5 seconds after it mounts (blank canvas, disabled palette, no crash). Checked in the packaged app (#38). `npm run package` prints a warning when the key is missing; it still builds.
- With a valid evaluation key (checked on 2026-10-11, packaged app): the canvas opens with its icons and fonts, no watermark, no license banner, and keeps rendering well after the 5 second gate. With an expired evaluation key the behavior is the one of a missing key. A hobby key will add the "made with tldraw" watermark, which must stay.
- `npm run smoke:packaged` checks the canvas of a package (rendered after the gate, no license message, assets loaded) and fails when the key is missing, invalid or expired ([[Packaging#Smoke test]]).

> [!warning] Evaluation key telemetry
> With an evaluation key in a production build, tldraw tries to fetch `https://cdn.tldraw.com/<version>/watermarks/watermark-track.svg?...` with the license id and the page URL (which contains the local file path). The CSP blocks it; the editor keeps rendering (seen again in the packaged app, as two console errors per canvas open). So does a missing key, and a hobby key by the 5.5.2 code (it tracks keys that show a watermark). Whether blocking this is acceptable under the license is an open question, with a draft message to tldraw in [[Packaging#Watermark tracking request]]; it is not sent.

## Offline assets and CSP

tldraw loads fonts, UI icons and translations from `cdn.tldraw.com` by default. The app bundles them instead:

- `@tldraw/assets` (same version as `tldraw`) gives Vite-imported URLs (`getAssetUrlsByImport`), passed as `<Tldraw assetUrls>`.
- `electron.vite.config.ts`, renderer:
  - `optimizeDeps.exclude: ['@tldraw/assets']`: the dev pre-bundler breaks the package's `?url` imports.
  - `build.assetsInlineLimit` inlines every `@tldraw/assets` file as a `data:` URL. From `file://`, Chromium blocks font and CSS mask loads (CORS on an opaque origin) and `fetch()` of files, so files next to the bundle do not work. Cost: the renderer bundle grows from about 4.3 MB to about 8.4 MB.
- UI icons: tldraw's sprite (`0_merged.svg#name`) does not work as a `data:` URL, so each icon points at its own SVG from `@tldraw/assets/icons/icon/`. tldraw writes them into an unquoted CSS `url()`, so `cssSafeUrl` percent-encodes quotes, parentheses and spaces.

CSP change (`src/renderer/index.html`): `connect-src 'self'` became `connect-src 'self' data:`, because tldraw `fetch()`es its translation files, now `data:` URLs. Nothing else changed: fonts already allowed `data:` (`font-src`), icons are CSS masks covered by `img-src 'self' data: blob:`, and styles already allowed `'unsafe-inline'`. No remote origin is allowed.

## Visual design

Issue #34, in the dark theme of [[Design System]]:

- **tldraw in dark mode**: `<Tldraw colorScheme="dark">` (the `colorScheme` option of `TLEditorOptions` in tldraw 5.5.2; there is no `inferDarkMode` prop in this version). The editor UI and the native shapes (arrows, text, notes) follow tldraw's dark theme; `designCanvas.css` sets its `--tl-color-background` to the `color-canvas` token so the drawing area matches the screen.
- **Palette**: a bar above the canvas (`designCanvas.css`, `data-testid="design-palette"`) with one `btn-sm` per component type and the Arrow tool. Each button has a left accent bar in the stroke color of its component on the canvas.
- **Typed shapes**: `componentColors(type, mode)` in `componentTypes.ts` gives fill, stroke and label color per color mode. The live shape reads the editor color mode (`useColorMode`) and in dark mode draws the same hue per type as before, one step lighter, over an opaque deep tint of that hue, with `text-primary` labels. The strokes stay distinct per type (tested).
- **Exports stay light**: `toSvg` of every shape always uses the `light` palette (pale fill, dark stroke, `#1d1d1d` label), whatever the editor theme. The Design Export PNG ([[Design Export]]) still asks tldraw for `darkMode: false` with no background and flattens the capture on opaque white (`exportDesignPng.ts`, unchanged), so the LLM sees dark strokes on white. Tests: the shapes' SVG contains no dark color and no CSS variable, and the PNG export is asked for light mode and painted on `#ffffff` before the capture. The persisted Design Scene format is unchanged (colors are not stored; they come from the shape type).

## Verification (2026-10-09)

Driven over the Chrome DevTools protocol with a scratch `--user-data-dir`:

- Dev server (`http://localhost`): palette adds shapes, label edited in place, arrow drawn with the arrow tool bound at both ends (load balancer to database, read from the saved snapshot), bound arrows follow a moved shape, scene restored after an app restart. No CSP violation, no request outside localhost, 16 fonts loaded.
- Built renderer from `file://` (`electron-vite preview`, with the dev entry temporarily ungated): the 4 other component types render, icons and the 16 fonts load, scene restored after restart. The only CSP violation is the evaluation-key telemetry above.
- Packaged app (2026-10-11, issue #38 and #39): launched from the `.app` over CDP with a scratch user data folder, an exercise canvas opens with its 37 bundled icons and fonts, a typed shape can be added, nothing is rendered differently from the preview run. Same single CSP violation. Automated since by `npm run smoke:packaged`.

## Related

- [[Design Canvas]], [[Design Scene]], [[Design Exercise]]
- Graph export for evaluation: [[Design Export]] (issue #13)

## Open licensing question: watermark tracking request

With an evaluation or hobby key (and with no key), a production build tries to fetch `cdn.tldraw.com/.../watermark-track.svg`. The request carries the license id and the local file path. The renderer CSP blocks it (decision: keep the block; nothing leaves the machine) and the editor keeps rendering.

Risk: the tldraw license forbids interfering with key enforcement, and blocking this request may count as such. To clarify with tldraw, ideally before relying on the hobby key: a draft message is in [[Packaging#Watermark tracking request]] (issue #38; not sent, the owner decides). If they object, allow `https://cdn.tldraw.com` in `connect-src` (it is a `fetch()`, so `img-src` is not enough) and accept the request.
