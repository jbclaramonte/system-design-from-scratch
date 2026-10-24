---
title: Design Canvas Integration
tags: [design-practice, architecture]
issue: [12, 63]
react-flow-version: "@xyflow/react 12.12.0"
scene-version: 1
---

# Design Canvas Integration

How the [[Design Canvas]] (React Flow) is embedded in the app and how its [[Design Scene]] is saved per [[Design Exercise]].

> [!info] History
> The canvas was first built on tldraw (issue #12, [[tldraw|tldraw spike]]). The [[react-flow|React Flow spike]] (issue #42) found that React Flow does everything the Design Exercises need with no license key, no watermark and no tracking request, and that its nodes and edges already are the [[Design Graph]] model. Issue #43 replaced tldraw by React Flow. Removing the tldraw package and its license key plumbing is issue #44.

## Code

All under `src/renderer/src/design/` unless stated otherwise.

| Path | Role |
|---|---|
| `DesignCanvas.tsx` | `<DesignCanvas designExerciseId onHandleChange>`: loads the stored scene before it mounts the canvas, autosaves it, shows the load error, the legacy-scene notice and the start-over action. |
| `storedScene.ts` | `readStoredScene(stored)`: what is in `design_scenes.snapshot` (nothing, a scene, a converted tldraw scene, an unconvertible one) or an `InvalidSceneError`. |
| `debouncedSave.ts` | Debounced, ordered autosave. |
| `flow/scene.ts` | The **Design Scene format**: zod schema, `serializeScene`, `deserializeScene`, `InvalidSceneError`. No React Flow import. |
| `flow/FlowCanvas.tsx` | The editor: `<ReactFlow>`, palette bar, undo and redo, copy and paste, snap to grid. `FlowCanvasHandle.getScene()` is all a host can ask. |
| `flow/flowModel.ts` | Pure functions around the nodes and edges (scene conversion, group membership after a drag, copy and paste). |
| `flow/nodes.tsx`, `flow/ComponentBody.tsx`, `flow/LinkEdge.tsx`, `flow/EditableText.tsx` | Component, note and group nodes (one drawing per component type), the connection edge (direction, label), plain-text label editing. |
| `flow/flowTheme.ts`, `flow/flowContext.ts`, `flow/flowCanvas.css` | `dark` and `light` (live, design tokens) and `export` (PNG, literal colors) palettes, the color mode and editor actions contexts, styles. |
| `flow/history.ts` | Undo and redo stack (React Flow has none). |
| `componentTypes.ts` | Catalogue of component types: labels, default sizes, colors (`componentColors(type, mode)`). The type list itself lives in `src/shared/designGraph.ts`. |
| `legacy/tldrawScene.ts` | Pure converter of a stored tldraw snapshot to a scene. No `tldraw` import. |
| `export/` | Design Export: graph, PNG, text description. See [[Design Export]]. |
| `src/main/ipc/design.ts` | IPC handlers over the `designPractice` repository. |
| `src/renderer/src/dev/DesignCanvasDevScreen.tsx` | Dev-only screen ("Design canvas (dev)" on the home screen) on a scratch exercise, with the Design Export panel. |

## Design Scene format

Stored as JSON in `design_scenes.snapshot` (one row per exercise, overwritten on save, see [[Data Model]]). Defined and validated by `flow/scene.ts` (zod), version **1**:

```json
{
  "version": 1,
  "nodes": [
    { "id": "n-1", "type": "group", "position": { "x": 368, "y": 32 }, "width": 480, "height": 320,
      "data": { "label": "Backend" } },
    { "id": "n-2", "type": "component", "parentId": "n-1", "position": { "x": 80, "y": 64 },
      "width": 160, "height": 90, "data": { "componentType": "service", "label": "Auth service" } },
    { "id": "n-3", "type": "note", "position": { "x": 704, "y": -80 }, "width": 200, "height": 120,
      "data": { "text": "..." } }
  ],
  "edges": [
    { "id": "e-1", "source": "n-2", "target": "n-4", "sourceHandle": "right", "targetHandle": "left",
      "data": { "label": "SQL", "direction": "both" } }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

- Only persisted fields: no selection, measured size, drag flags or arrowheads (the arrowheads come back from `direction`). Unknown fields are dropped on read.
- Node `type` is `component` | `note` | `group`; the semantic type is `data.componentType` (the 7 `COMPONENT_TYPES`). Array order is the drawing order.
- Positions are relative to the parent group (React Flow's rule); sizes are always stored, so the export never depends on a measured DOM.
- `edge.source` is the tail and `edge.target` the head, like `from` / `to` in the Design Graph. `direction` uses the Design Graph values (`forward`, `backward`, `both`, `none`).
- Structural checks beyond the shape: unique ids across nodes and edges, parents exist and are groups, no nesting loop, edges end on a component or a note.
- To change the format later, bump `version` and add a reader for the old one in `readStoredScene`. An unknown version is an error, never a silent reset.

## Persistence

- IPC (`src/shared/ipc.ts`): `design:loadScene` returns the stored JSON or `null`; `design:saveScene` stores it. The main process checks the exercise id and that the value is a JSON object, nothing more: the format belongs to the renderer, which validates it on every read and refuses to write an invalid one (`serializeScene`). **No database migration was needed**: the column already is validated JSON text, and the format is told apart by its content (`version` against tldraw's `document.store`).
- `DesignCanvas` loads the scene **before** it mounts the canvas (`readStoredScene`). A stored value that is not a Design Scene shows `Could not load the design scene: ...` with the path of the first problems and mounts no canvas, so the autosave can never overwrite it.
- Autosave: every change worth saving calls `onDirty` (selection, node measures and panning do not); the scene is captured and saved 500 ms after the last change, saves run one after the other. Pending changes are flushed when the canvas unmounts (the handle keeps answering during the unmount) and, best effort, on `pagehide` (a change made less than 500 ms before the app quits can be lost). Checked: add a component and leave the screen at once, the scene is stored.
- `design:openScratchExercise` gets or creates the exercise with slug `dev-scratch`, for the dev screen only. It is rejected in a packaged app.

## Legacy tldraw scenes

Exercises started before issue #43 may hold a tldraw snapshot (`{ "document": { "store", "schema" }, "session" }`) in `design_scenes.snapshot`. Decision: **convert on load, in memory, with a pure function; write back only on the learner's first edit.**

Why convert instead of dropping or only showing a message: the scene holds the learner's work on an exercise already under way, the conversion is mostly mechanical, and a dropped scene cannot be brought back. Why not write on load: a read must not change data; if the conversion looks wrong, the original is still in the database until the learner chooses to keep the new version by editing.

- `legacy/tldrawScene.ts` reads the plain JSON records, **without importing `tldraw`** (so the package can go in #44). It was checked against a real snapshot drawn with tldraw 5.5.2 (`legacy/fixtures/tldraw-5.5.2-snapshot.json`) and the hand-built fixtures of the old export tests (`legacy/tldrawFixtures.ts`).
- Mapping, from the page the snapshot was showing:
  - catalogue shapes become component nodes (label from `props.text`, size from `props.w` / `props.h`);
  - arrows become edges from the **binding records** (never from the stale `props.start` / `props.end`), direction from the arrowheads, label from the arrow text. Sides are chosen so that the two nodes face each other (the old arrows attached anywhere on the outline);
  - `frame` becomes a group node (name to label); shapes inside a frame keep it as parent with a relative position. A tldraw `group` (no size, no name) is flattened;
  - every other shape with text (`note`, `text`, labelled `geo`) becomes a note node (notes keep tldraw's 200 x 200 size, scaled);
  - the view is the one the learner left (tldraw camera of the page: `viewport = camera * zoom`), else the content framed at a fixed margin.
  - Node ids are kept (`shape:xxxx`), so earlier feedback still points at the same shapes.
- What cannot be kept is listed in `warnings` and shown in a notice above the canvas: arrows without a node at both ends (the new canvas has no free-floating arrow), arrows on a frame or on another arrow, shapes without text (freehand strokes, empty boxes).
- The notice `This design was drawn with the previous canvas and has been converted. The converted version is saved after your next change.` stays while the canvas is open. The first autosave after an edit replaces the tldraw snapshot by the converted scene (checked in the app: after loading and 3 seconds without touching anything the row was still the tldraw snapshot; after one drag it held the version 1 scene).
- A snapshot that cannot be converted (not valid after conversion, for instance more than 2,000 shapes) shows `data-testid="legacy-scene"`: the reason, a statement that the design is untouched, and a button **Start over with an empty canvas**. A second click (**Discard the old design and start over**) stores an empty scene and mounts the canvas; nothing else overwrites the old value.

## Behaviors

Validated in the [[react-flow|spike]] and checked again in the production canvas:

- **Palette** (`data-testid="design-palette"`): one button per component type (`add-<type>`, a left accent bar in the stroke color of the component), `add-note`, `add-group`, Undo, Redo, Snap to grid (16 px). A new node appears at the center of the view and is selected.
- **Components**: seven drawings (browser window, CDN, hexagon load balancer, service, dashed cache, cylinder database, queue bars), each resizable; the label is edited in place (double-click, Enter, Escape).
- **Connections**: drag from any of the four handles of a node to any handle of another; a connection to the node itself is refused. The selected connection shows a label field and four direction buttons (no arrow, one way, reversed, both ways); arrowheads follow the direction.
- **Notes** (multi-line, Cmd+Enter) and **groups** (a titled frame whose children follow it; a node dropped in or out changes parent). New notes and groups start empty, with a hint that the live canvas shows and the PNG does not: an empty note is left out of the Design Graph.
- **Keyboard**: Backspace and Delete remove the selection (a group takes its content, a node its connections), Cmd/Ctrl+Z undo, Shift+Cmd+Z or Cmd+Y redo, Cmd+C and Cmd+V copy and paste (new ids, offset, connections between copied nodes, group content follows), Cmd+A select all. The shortcuts are a `window` listener: Undo must work after a deletion dropped the focus to the page body.
- **Mouse**: drag on empty canvas selects, middle or right button pans, trackpad scrolls and pinches, controls and a minimum zoom of 0.1.

## Visual design

Issue #34 (dark), #63 (light). The canvas follows the Theme of [[Design System]] ([[Theme]]):

- **Mode**: `FlowEditor` takes the mode from the active theme (`useResolvedTheme()`, `flowModeOfTheme`) and provides it with `FlowModeContext`, passes it to React Flow's `colorMode` and to everything it creates (arrowheads of new, pasted and edited connections). The root has no `data-theme` of its own. A switch of Theme re-renders the nodes with the other mode: no reload, no change to the stored scene.
- **Three modes** (`FlowMode`): `dark` and `light` for the live canvas, `export` for the PNG. Colors of edges, labels, notes and groups are in `FLOW_PALETTES[mode]`. The live palettes name tokens (`var(--token)`, marker colors accept them too), so they follow the tokens of the theme without a state change: the edge and selected-edge colors are the same strings in both (`text-secondary`, `border-focus`: slate and indigo in dark, brown and cobalt in light), which keeps the arrowheads stored in the edges valid across a switch (tested). `light` notes are an opaque honey tint (`color-mix` of `attention` over `surface-base`) with an `attention` border, groups the `hover` overlay with a dashed `border-active`, label chips white. The `export` palette is the literal one the PNG always had.
- **Stylesheet**: `flowCanvas.css` maps React Flow's `--xy-*` variables to tokens. Tokens have a value per theme, so one mapping serves both; handles are the in-progress color (indigo, terracotta) with a canvas-colored ring, the selection box is its tint, and the dotted grid is `border-active` in dark and the lighter `border-control` in light (a warm brown dot on the peach canvas).
- `componentColors(type, mode)` in `componentTypes.ts` gives fill, stroke and label color per mode. `dark`: each type keeps its hue, one step lighter, over an opaque deep tint, with `text-primary` labels. `light`: the fills and strokes of the PNG (pale tint, saturated stroke) with `text-primary` labels. `export`: the same with the literal `#1d1d1d`. The strokes stay distinct per type, readable on the canvas of their theme (3:1) and the labels on their fills (4.5:1): `flowTheme.test.ts`, from the values of `design-tokens.css`.
- **Rule: nothing a node draws takes its color from a stylesheet rule.** Every color of a node is inline, from the mode (`FlowModeContext`): the PNG export draws the same nodes in the `export` mode, and a color from a stylesheet rule would follow the theme of the app into it (the first capture of the spike had unreadable labels for that reason).
- The persisted scene stores no color: it comes from the node type.
- A small "React Flow" attribution chip stays in a corner of the live canvas (`proOptions` is not set; MIT does not require it, it is a courtesy). It is left out of the PNG.

## Gaps of React Flow and how they are filled

1. **Controlled mode needs `onNodesChange` to measure**: nodes and edges stay in `useNodesState` / `useEdgesState`, also in the off-screen export canvas.
2. **A node of type `group` gets React Flow's own group styling**: overridden in `flowCanvas.css`.
3. **A group body must let pointer events through** (`dragHandle` on the title, `pointer-events: none` on the wrapper), or a box selection that starts inside a group does nothing.
4. **Edge labels sit under the nodes** by default: `.react-flow__edgelabel-renderer { z-index }`.
5. **Resizes by the user must count as changes to save**, measures must not: `isDirtyChange` in `FlowCanvas.tsx`.
6. **Parent before child** in the nodes array: `sortParentsFirst`.
7. **A hidden window never paints**: `requestAnimationFrame` and `ResizeObserver` do not run, so the PNG export fails after 10 s with "is the window visible?" instead of waiting forever. Automated checks over the DevTools protocol need `Emulation.setFocusEmulationEnabled`.
8. **Panning does not mark the scene as changed** (as with tldraw, whose camera was not part of the document): the viewport is saved with the next edit. This also keeps a converted legacy scene from being written by a pan.

Lost against tldraw, none of it used by the Design Exercises: freehand drawing, geometric shapes, standalone text shapes, free-floating arrows, arrows that attach anywhere on the outline (four handles per node here), rich text, images, embeds, multi-page.

## License, attribution, CSP

- `@xyflow/react` and `@xyflow/system` are MIT; so are `classcat`, `zustand` and `html-to-image`. The About screen lists them through `resources/licenses.json` like any other package ([[Attribution and Licenses]]).
- The renderer needs no key and makes no request: no watermark, no tracking request, no CDN.
- **CSP** (`src/renderer/index.html`): `connect-src 'self'`. It had been `'self' data:` for tldraw, which `fetch()`ed its translation files as `data:` URLs. Nothing else needs it: React Flow ships its CSS in the bundle, and the PNG capture embeds the page fonts (already `data:` URLs in the built renderer) and draws an SVG `data:` image, covered by `font-src` and `img-src`. Checked with `connect-src 'self'` in the dev server, the built renderer from `file://` and the packaged app: no CSP violation, no console error, PNG export works.
- **Vite**: `@tldraw/assets` is no longer inlined or excluded from the dev pre-bundler (`electron.vite.config.ts`); only the self-hosted fonts are inlined as `data:` URLs because `file://` blocks font loads (CORS, opaque origin).

## Verification (2026-10-12, issue #43)

Dev server and packaged `.app` (`npm run package:dir`, `npm run smoke:packaged`), driven over the Chrome DevTools protocol with real mouse and keyboard events and a scratch `--user-data-dir`:

- Exercise 1 and 2 (Interview Protocol, step High-level design): components added from the palette, moved, connected by dragging between handles, label edited, a connection labelled and set to both ways, delete then Cmd+Z restores the node and its connection, note added. Autosave wrote the version 1 scene; a reload restored nodes and edges.
- A step submitted with the repository's fake CLI: the payload (Design Graph, description, PNG, notes) passed the zod validation of the main process and reached the model call (`protocol:submitStep`); the evaluation answered; the PNG the model receives was read from the CLI input: light mode, opaque white, 1344 x 700 for a small scene, 1568 x 844 for the seven-component architecture of the dev panel.
- A real tldraw snapshot (drawn with the old canvas) opens converted, with the notice and one warning; unconvertible and invalid stored values show their message without a canvas and without touching the database.
- Packaged app (`file://`): the canvas, fonts and the PNG export work under `connect-src 'self'`; the smoke test passes (14 checks).
- Not checked: Windows, Linux, trackpad pinch, hundreds of nodes, a screen reader, the macOS system clipboard path of Cmd+C (the clipboard is in memory, per canvas).

## Related

- [[Design Canvas]], [[Design Scene]], [[Design Exercise]]
- Graph export for evaluation: [[Design Export]] (issue #13)
- [[react-flow|React Flow spike]] (the verdict and what it measured), [[tldraw|tldraw spike]] (history)
