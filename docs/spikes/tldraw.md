---
title: "Spike: tldraw license and shape library"
tags: [spike, design-practice]
issue: 2
date: 2026-10-08
status: done
decision: tldraw confirmed (hobby license key required for packaged builds)
tldraw-version: 5.5.2
---

# Spike: tldraw license and shape library

GitHub issue: #2. Context: [[SPEC]] section 6.1 and section 10, [[Design Canvas]], [[Design Exercise]].
Code: `spikes/tldraw/` (throwaway proof of concept, not the app).

> [!success] Decision
> **tldraw is confirmed** for the [[Design Canvas]]. Custom typed shapes, arrow bindings, graph JSON export and PNG export all work with `tldraw@5.5.2`. One action is required before the first packaged Electron build: obtain a **hobby license key** (free, discretionary, shows a "made with tldraw" watermark). Until then, development against `localhost` works with no key.

## 1. License

Tested version: **`tldraw@5.5.2`** (npm `latest` on 2026-10-08). npm metadata: `"license": "SEE LICENSE IN LICENSE.md"`. This is not MIT or Apache: it is the tldraw license, which is a source-available license.

Sources:
- Repo license: https://github.com/tldraw/tldraw/blob/main/LICENSE.md (identical to the `LICENSE.md` pointer shipped in the npm tarball)
- License page: https://tldraw.dev/community/license
- License key docs: https://tldraw.dev/sdk-features/license-key
- Hobby license: https://tldraw.dev/get-a-license/hobby
- Enforcement code, read in `@tldraw/editor@5.5.2` (`LicenseManager.ts`, `Watermark.tsx`, `LicenseProvider.tsx`): https://github.com/tldraw/tldraw/tree/v5.5.2/packages/editor/src/lib/license

### What the license says

- Permitted: "Use the Software in Development Environments", modify it, bundle it with your own projects.
- Condition: "Not to use the Software in Production Environments."
- Definition: "Production Environment" means "any production deployment of the Software that operates on servers, cloud platforms, web applications, or where the software is used to provide functionality to end users, customers, or the public. Production Environment excludes internal development."
- Also: do not "disable, change, or interfere with the Software's License Key enforcement", do not remove notices, include a verbatim copy of the license in any distribution.
- Production use needs a trial, commercial, or hobby license. The license page: "Under its default terms, the tldraw SDK license permits use only in development" and "The SDK will work in production only when provided with a valid and active license key."
- Hobby: "For non-commercial projects, we also provide a discretionary hobby license", and "the 'made with tldraw' watermark must be shown on the canvas". The hobby page says it is "for personal projects and early experiments; student work, research, side projects, prototypes". Requests are reviewed by a person ("a member of our team will take a look, and we might reach out to hear more about what you're making").
- Keys are validated client-side, offline, and "can be public". With a hobby or commercial key "no information is sent to tldraw" (license page). Trial keys in production send a key hash.

| Type | Watermark | Duration |
|---|---|---|
| Trial | no | 100 days, one per commercial unit |
| Commercial | no | annual |
| Hobby | yes ("made with tldraw") | varies, discretionary |

### What this means for a personal, non-distributed Electron app

1. **Development (`vite` dev server, `electron .` pointed at `http://localhost:*`)**: no key needed. The editor works fully and shows a small **"Get a license for production"** watermark bottom-right (state `unlicensed`, seen in the spike screenshot). Exports (PNG/SVG) do not contain the watermark.
2. **Packaged Electron build** (renderer loaded from `file://` or a custom scheme, `NODE_ENV=production`): the SDK classifies this as production. Without a valid key it logs errors and, per the docs, "after five seconds, stops rendering the editor" (`LICENSE_TIMEOUT = 5000`, state `unlicensed-production`). So a key is **required** even for a personal app you never distribute, if you run the packaged build.
3. **Requirement**: apply for the hobby license, pass the key with `<Tldraw licenseKey="..." />` (or `TLDRAW_LICENSE_KEY` env var). Keys encode allowed hosts; the license manager has a "native license" mode where the host list holds a protocol regex (for example `app-bundle:`) matched against `window.location.href`. **Ask tldraw for a key that matches the Electron origin** (`file://` or the custom protocol you will use) when applying; this is the one point I could not confirm from the public docs, which do not mention Electron.
4. The watermark must stay visible with a hobby key. The project is a personal learning tool, which fits the stated hobby audience.

> [!warning] Do not bypass enforcement
> The dev check (`getIsDevelopment`) treats any `http:` origin or loopback host as development. Serving the packaged renderer from `http://localhost` would therefore "work" without a key, but that is exactly the "interfere with License Key enforcement" the license forbids. Do not do it.

> [!note] Judgement call
> Whether a single-user local app is a "Production Environment" in the legal sense ("used to provide functionality to end users ... or the public") is ambiguous. I did not rely on that reading: the runtime enforcement is what breaks the app, so plan for a key. If the hobby request is declined, see fallbacks below.

## 2. Proof of concept

Location: `spikes/tldraw/` (Vite 8 + React 19 + TypeScript 7, all versions pinned exactly in `package.json`).

```
src/shapes/componentShapes.tsx    4 custom ShapeUtils: load-balancer, cache, database, queue
src/graph/exportGraph.ts          pure buildGraph(shapes, bindings) -> SceneGraph (no editor/DOM)
src/graph/exportGraph.test.ts     vitest, 8 tests
src/fixtures/scene.ts             fixture scene (5 nodes, 5 bound arrows, 2 annotations)
src/App.tsx                       palette, arrow tool, load fixture, export JSON / PNG, live JSON panel
```

Run: `cd spikes/tldraw && npm install && npm run dev`, then click "Load fixture". Checks: `npm test`, `npm run build`.

### Verified

| Check | How | Result |
|---|---|---|
| Unit tests | `npm test` (vitest 5.0.3) | 8 passed |
| Type check and production build | `npm run build` (`tsc --noEmit && vite build`) | passes |
| Custom shapes render | dev server driven with `agent-browser`, screenshot | all 4 render, labels editable via `PlainTextLabel` |
| Palette adds shapes | clicked palette buttons in the browser | shapes created at viewport centre |
| Arrows bind to custom shapes | drew an arrow with the arrow tool (real mouse drag) from a load balancer to a database | binding created, exported as an edge |
| Bound arrows follow moved shapes | moved the cache shape via the editor API, screenshot | arrows re-routed |
| Graph export from a live editor | live JSON panel read in the browser | 5 nodes, 5 edges, 2 annotations, 0 unconnected arrows, same as the unit-test expectation |
| PNG export | `editor.toImageDataUrl` in the browser, decoded and viewed | valid 884x544 PNG, custom shapes and labels present |

### Not verified

- Behaviour of a packaged Electron build (`file://`): derived from reading `LicenseManager.ts` v5.5.2 and the docs, not run. No Electron shell exists yet.
- No hobby key was requested, so the "made with tldraw" watermark and key/host matching were not observed.
- The "Export PNG" and "Export graph JSON" buttons' browser download dialogs were not exercised (the underlying `toImage` call and the JSON panel were).
- Dark mode, touch, undo/redo of custom shapes, and performance with many shapes.

### Graph JSON shape

```json
{
  "version": 1,
  "nodes": [{ "id": "shape:lb", "type": "load-balancer", "label": "Load balancer",
              "position": { "x": 240, "y": 0 }, "size": { "w": 160, "h": 90 } }],
  "edges": [{ "id": "shape:e2", "from": "shape:lb", "to": "shape:cache", "label": "GET /{id}",
              "arrowheadStart": "none", "arrowheadEnd": "arrow" }],
  "annotations": [{ "id": "shape:note1", "kind": "text", "text": "Reads are ~100x writes",
                    "position": { "x": 240, "y": 330 } }],
  "unconnectedArrows": []
}
```

Node `type` is the shape type (`load-balancer`, `cache`, `database`, `queue`) or `generic` for a plain geo box such as "Client". Output is sorted (top-to-bottom, left-to-right) so the same scene always yields the same JSON. Arrows with an unbound end are reported in `unconnectedArrows` instead of inventing an edge, so the LLM evaluation can flag them as a design error.

## 3. API notes (tldraw 5.5.2)

- **Custom shape**: augment `TLGlobalShapePropsMap` (`declare module 'tldraw'`), type the shape as `TLShape<'my-type'>`, extend `ShapeUtil`. Set `static type` and `static props` (validators from `T`); without `props`, nothing is validated.
- **Required methods**: `getDefaultProps`, `getGeometry`, `component`, and **`getIndicatorPath`** (returns a `Path2D`). Older tutorials use `indicator()` returning JSX; that is not the v5 API.
- **Arrow binding is free**: any shape with `getGeometry` and `canBind()` true (default) can be an arrow target. The geometry decides where the arrow touches the shape (the load balancer uses `Polygon2d` so arrows meet the hexagon outline, others use `Rectangle2d`).
- **Programmatic binding**: `editor.createShapes([...arrow])` then `editor.createBindings([{ type: 'arrow', fromId: arrowId, toId: targetId, props: { terminal: 'start' | 'end', normalizedAnchor, isExact, isPrecise, snap } }])`. `snap` is required in v5 (`'center' | 'edge-point' | 'edge' | 'none'`).
- **In-place label editing**: `PlainTextLabel` (exported from `tldraw`) edits a plain `text: string` prop; `canEdit()` must return true. Rich text (`richText` prop, `toRichText`) is used by built-in geo/arrow/text shapes.
- **Export**: `editor.toImage(ids, { format: 'png', pixelRatio, background })` returns `{ blob }`; `toImageDataUrl` returns `{ url }`; `getSvgString` for SVG. Raster calls throw when nothing can be exported, SVG calls return `undefined`.
- **Custom shape in exports**: implement `ShapeUtil#toSvg`. I render the same SVG body as the live component plus a plain `<text>` label instead of relying on the HTML label (foreignObject).
- **Resize**: `onResize` with the exported `resizeBox` helper.
- **Package ships its own docs and sources**: `node_modules/tldraw/DOCS.md` (LLM-oriented API doc) and `src/`. Useful when web docs lag the version.

## 4. Gotchas

1. **Stale arrow props**: for a bound arrow, `props.start` / `props.end` are not the source of truth. After moving a bound shape, the stored values stay unchanged while the rendered arrow follows. Always derive connections from **binding records** (`fromId` = arrow, `toId` = target, `props.terminal`), as `buildGraph` does.
2. **Terminal direction**: `start` binding is the arrow tail, `end` is the head. `arrowheadStart`/`arrowheadEnd` may flip the visual direction, so they are exported alongside `from`/`to`.
3. **Bindings are separate records**: `editor.getCurrentPageShapes()` does not include them; read `editor.store.allRecords()` filtered on `typeName === 'binding'` (or `getBindingsFromShape`).
4. **Fixture loading**: `createShapes` accepts partials, but arrow bindings must be created in a second call after the shapes exist.
5. **Positions are parent-relative**: shapes in frames/groups need parent offsets summed (handled in `buildGraph`, rotation ignored).
6. **Dev watermark**: "Get a license for production" shows in dev without a key. Cosmetic, but expect it in screenshots.
7. **Bundle size**: production bundle is about 1.9 MB (580 kB gzip). Irrelevant in Electron.
8. **Toolchain**: TypeScript 7.0.2, Vite 8.3.4 and Vitest 5.0.3 all worked. Vitest config must be imported from `vitest/config`, not `vite`. A generic `ShapeUtil<S>` base class needs a cast on `onResize` (`resizeBox` return type is not assignable to `TLShapePartial<S>`).
9. **React peer**: `react` / `react-dom` `^18.2.0 || ^19.2.1`.

## 5. Decision and next steps

**tldraw confirmed.** Typed shapes and the structured export are straightforward, and the build is solid.

Follow-ups (not done in this spike):
- Request a hobby key (https://tldraw.dev/get-a-license/hobby), mentioning an Electron desktop app and the origin it will load from. Needed before the first packaged build. Track it in the issue for the Electron shell.
- Keep the editor off the critical path of packaged builds until the key exists: use `electron .` against the dev server in the meantime.
- #12 (typed shapes) and #13 (export) can start from `spikes/tldraw/src/shapes` and `src/graph`. The graph schema above is a proposal to confirm against the evaluation prompt.

Fallbacks if the hobby request is declined or the terms change (items 3 and 4 are from general knowledge, licenses and features not re-checked in this spike):
1. **100-day trial key** (free, no watermark, one per commercial unit): buys time, then expires with no grace period.
2. **Commercial license**: paid, likely overkill for a personal tool.
3. **Excalidraw** (MIT, `@excalidraw/excalidraw`): arrow binding to shapes exists, but custom typed shapes are not a first-class concept (typing would live in `customData`). More graph-export glue.
4. **React Flow** (MIT): nodes and edges are the native model, so graph export is trivial and custom node types are first class; no freehand drawing and a less whiteboard-like feel. Best fallback when the typed graph matters more than sketching.

[[SPEC]] section 10 ("tldraw license: not verified") can be updated to point at this note.
