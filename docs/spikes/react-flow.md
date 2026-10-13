---
title: "Spike: React Flow as the Design Canvas engine"
tags: [spike, design-practice]
issue: 42
date: 2026-10-12
status: done
decision: go (React Flow replaces tldraw as the Design Canvas engine; migration done in #43)
react-flow-version: "@xyflow/react 12.12.0"
---

# Spike: React Flow as the Design Canvas engine

GitHub issue: #42. Context: [[Design Canvas Integration]], [[Design Export]], [[tldraw|tldraw spike]], [[Design System]], [[Attribution and Licenses]], [[Packaging]]. Terms: [[Design Canvas]], [[Design Scene]], [[Design Graph]], [[Design Export]].

Code of the spike (additive, tldraw untouched at the time): `src/renderer/src/design/flow/`, dev screen `FlowCanvasDevScreen.tsx` (removed in #43, see below). `src/shared/designGraph.ts` is unchanged and imports nothing from React Flow.

> [!success] Verdict: GO
> React Flow does everything the Design Canvas needs, and removes what hurts with tldraw: **no license key, no watermark, no tracking request, no CDN**. The nodes and edges already are the [[Design Graph]] model, so the export is a mapping instead of a reconstruction from binding records. The cost is a set of small things React Flow does not do (undo, copy and paste, text editing, group membership, PNG), about 1,000 lines of code written and tested in this spike. What is lost against tldraw (freehand drawing, free-floating arrows, text shapes) is not used by the Design Exercises: the [[Design Graph]] ignores freehand strokes and reports free arrows as errors.

> [!success] Outcome: migrated in issue #43
> The spike code is the production canvas now (`flow/`), wrapped by `DesignCanvas.tsx`. What changed on the way, and the details: [[Design Canvas Integration]], [[Design Export]].
> - The recommendation "drop the existing tldraw scenes" became a **conversion on load** (`legacy/tldrawScene.ts`, no `tldraw` import), written back only after the first edit.
> - The graph and PNG export moved to `design/export/` (`exportDesignGraph(scene)`, `exportDesignPng(scene)`); the Design Graph version stays 1. The `shape:` id question: nothing outside the export reads the prefix.
> - The spike dev screen (localStorage) was folded into "Design canvas (dev)" (scratch exercise, Design Export panel). Test ids are `design-*`, `add-<type>`.
> - Fixes: the pending autosave is flushed when the canvas unmounts (the spike's handle was gone by then), panning no longer marks the scene as changed, new notes and groups start empty (an empty note stays out of the graph and the PNG).
> - Renderer bundle, `npm run build`: `index-*.js` 9,444 kB (3.10 MB gzip) to **1,906 kB (381 kB gzip)**, `index-*.css` 440 kB (208 kB gzip) to **337 kB (187 kB gzip)**, `out/renderer` 20.1 MB to **12.6 MB**, with `@tldraw/assets` no longer inlined and `connect-src` back to `'self'`.

## Verified in the real app

Electron dev build (`npm run dev` with a scratch `--user-data-dir`, never the real folder), driven over the Chrome DevTools protocol with real mouse and keyboard events, and the built renderer run from `file://` (`electron-vite preview`, scratch user data dir). A small architecture was built by hand: client, load balancer, two services inside a group, database, cache, queue, a note and seven connections.

| Check | Result |
|---|---|
| Dark theme on the design tokens, palette of all 7 `COMPONENT_TYPES` with the `componentColors` hues, one drawing per type (browser window, hexagon, cylinder, dashed cache, queue bars) | works |
| Editable plain-text label (double-click, Enter, Escape), multi-line note (Cmd+Enter) | works (written, see below) |
| Connection by dragging from any handle to any handle; direction none, one way, reversed, both ways; optional label on the path | works |
| Note node, group node with children that follow it, nodes dropped in or out of a group change parent | works (parenting is written, see below) |
| Autosave (debounced, same helper as the tldraw canvas), reload from the stored JSON restores nodes, edges, viewport | works |
| Stored value that is not a valid scene (missing viewport, text that is not JSON, a tldraw snapshot) | error with the path of the first problems, no canvas mounted, storage untouched |
| Design Graph export (`designGraphSchema.parse`, `describeDesignGraph` unchanged) | works, same text as the tldraw export for the same drawing |
| PNG export, light mode, opaque white, 1568 x 998 for the test scene, 448 x 308 for one node | works, readable (see below) |
| `file://` (built renderer): canvas, fonts (Geist inlined as `data:`), PNG export | same result as the dev server, no console error, no CSP violation |
| tldraw "Design canvas (dev)" screen | still renders and accepts shapes |

### PNG review

Screenshots were kept under the session scratch folder, not in the repo. The test scene exports as 1568 x 998 (limit 1568). Looked at in full size:

- Text: node labels, edge labels and the note are crisp (Geist embedded, dark text on pale fills); the group title is small but legible.
- Arrowheads: filled, 18 px, on the right ends; "both ways" shows two heads, "no arrow" shows a plain line.
- Group border: dashed slate border on a faint fill, clearly a frame; the nodes inside stay on top of it.
- Opaque white background, no trace of the dark UI.
- Defects (of the drawing, not of the engine): two connections that leave the same side of a node share a segment (an "Order service" tee that reads as one line); the queue label crosses the queue's divider bars, as in the tldraw version; a scene that is very wide shrinks to unreadable text (7 000 units wide gives 1568 x 42, same trade-off as the tldraw export).
- First version of the capture had **unreadable component labels**: the label color came from a stylesheet rule (`var(--color-text-primary)`), which html-to-image resolved in the dark theme. Fixed by giving every color of a node inline from the mode (`componentColors(type, mode)`, `FLOW_PALETTES`). Rule for #43: nothing a node draws may take its color from the stylesheet.

## What is native, what had to be written

| Behavior | React Flow 12 | Spike |
|---|---|---|
| Delete selection (Backspace, Delete) | native (`deleteKeyCode`), deleting a group deletes its children, deleting a node deletes its edges | `onBeforeDelete` takes an undo snapshot |
| Multi-select | native: box selection (`selectionOnDrag`), Cmd/Ctrl-click adds (Shift-click does not add, Shift is the box key of the default settings) | `selectionOnDrag` + `panOnDrag={[1, 2]}` for a whiteboard feel |
| Select all (Cmd+A) | not native | 3 lines |
| Undo and redo | **not native** | `history.ts` (40 lines, tested) + snapshots taken right before each change (drag start, delete, connect, add, paste, label edit, resize, direction change) |
| Copy and paste | **not native** | `copySelection` / `pasteClipboard` in `flowModel.ts` (tested): new ids, offset, edges between copied nodes, group content follows |
| Snap to grid | native (`snapToGrid`, 16 px, toggle in the palette) | none |
| Alignment guides | not native, not written | gap, not needed |
| Pan, zoom, fit, minimap, controls | native (trackpad scroll and pinch, `Controls`) | |
| Resize | native `NodeResizer` | one line per node type; resizes were not marked as a change to save until fixed (below) |
| Plain-text label editing | **not native** | `EditableText.tsx` (75 lines) |
| Edge label and direction | not native | `LinkEdge.tsx`: custom edge, arrowheads from `direction` through `markerStart` / `markerEnd`, label chip and four direction buttons on the selected edge |
| Group membership | `parentId` is native, **changing it on drop is not** | `reparentDropped` (tested): innermost group under the center, positions converted |
| Keyboard shortcuts | `deleteKeyCode` only | window `keydown` listener (Cmd+Z, Shift+Cmd+Z, Y, C, V, A), ignored in fields |
| PNG | **not native** (docs use `html-to-image`) | `exportPng.tsx` + `pngLayout.ts` |
| Arrow routing around nodes | no obstacle avoidance (`smoothstep` only) | accepted |

### Lost compared to tldraw

- Freehand drawing, highlighter, geometric shapes, standalone text shapes, laser pointer: gone. Notes and groups stay.
- Free-floating arrows (an arrow with an end in the air): gone, and no loss: every connection is bound at both ends, so a Design Graph never has an unbound end from the canvas itself. `danglingArrows` then only comes from a connection to a note. A drag that ends on empty canvas does nothing (could open a menu to add a node there, a nice-to-have).
- Arrows that re-route to the nearest side and attach anywhere on the outline: connections use four fixed handles per node.
- tldraw's frame tool, rich text, images, bookmarks, embeds, multi-page, dark and light switch.
- A self-connection (node to itself) is refused in the spike (`isValidConnection`): it drew a loop that read as noise.

## Gaps and how they were filled

1. **Controlled mode needs `onNodesChange` to measure.** Nodes only get their `measured` size, and edges only draw, when the `nodes` state is fed back through `useNodesState` / `onNodesChange`. The off-screen export canvas first passed fresh arrays and no handler and never got ready. Keep nodes and edges in `useNodesState` / `useEdgesState`.
2. **A node of type `group` gets React Flow's own group styling** (translucent fill, border, padding). Overridden in `flowCanvas.css` (`.react-flow__node-group`). Either keep the override or name the type `frame`.
3. **Group body must let pointer events through**, otherwise a box selection that starts inside a group does nothing. `dragHandle` limits dragging to the title, and `pointer-events: none !important` on the wrapper with the title and resize handles re-enabled.
4. **Edge labels sit under the nodes** by default, so a short connection puts its label (and its input) behind a node. `.react-flow__edgelabel-renderer { z-index }` fixes it.
5. **Resizes by the user do not mark the scene as changed** if "dimensions" changes are filtered out as measurement noise. User resizes carry `resizing` / `setAttributes`; measurements do not.
6. **Undo must work after a deletion**, when the focus falls back to `body`: the shortcuts are a `window` listener, not a handler on the canvas element.
7. **Arrowheads of the dark theme**: marker colors accept `var(--token)` (verified), so the live canvas follows the design tokens. Markers are derived from `direction`, never stored.
8. **A hidden window never paints**: with the window minimized or occluded, `requestAnimationFrame` and `ResizeObserver` do not run, so the PNG export would wait forever. It now fails after 10 s with "is the window visible?". The automated checks needed `Emulation.setFocusEmulationEnabled` for this reason.
9. **Parent before child** in the nodes array is required by React Flow; `sortParentsFirst` enforces it and also puts groups behind the components of the same level. "Bring to front" is not offered.

## Data format (recommendation for #43)

`src/renderer/src/design/flow/scene.ts`, zod, no React Flow import, validated on read and refused on write (`serializeScene`). Fits `design_scenes.snapshot` as is (JSON, `Json` type).

```json
{
  "version": 1,
  "nodes": [
    { "id": "n-1", "type": "group", "position": { "x": 368, "y": 32 }, "width": 480, "height": 320, "data": { "label": "Backend" } },
    { "id": "n-2", "type": "component", "parentId": "n-1", "position": { "x": 80, "y": 64 }, "width": 160, "height": 90,
      "data": { "componentType": "service", "label": "Auth service" } },
    { "id": "n-3", "type": "note", "position": { "x": 704, "y": -80 }, "width": 200, "height": 120, "data": { "text": "..." } }
  ],
  "edges": [
    { "id": "e-1", "source": "n-2", "target": "n-4", "sourceHandle": "right", "targetHandle": "right",
      "data": { "label": "SQL", "direction": "both" } }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

- Only persisted fields: no selection, measured size, drag flags or markers. Unknown fields are dropped on read.
- Node `type` is `component` | `note` | `group`; the semantic type is `data.componentType` (the 7 `COMPONENT_TYPES`). Array order is the drawing order.
- Positions are relative to the parent group (React Flow's rule); sizes are always stored, so the export never depends on a measured DOM.
- `edge.source` is the tail and `edge.target` the head, like `from` / `to` in the Design Graph; `direction` uses the Design Graph values (`forward`, `backward`, `both`, `none`).
- Structural checks beyond shape: unique ids across nodes and edges, parents exist and are groups, no nesting loop, edges end on a component or a note.
- A stored value that fails the schema is an `InvalidSceneError` with the path of the first three problems; the screen shows it and mounts no canvas (so the autosave cannot overwrite the data). `null` means "no scene yet".
- **Migration of stored data**: existing tldraw snapshots are not valid scenes and would show that error. Either drop them (the app is not shipped, the dev screens use scratch exercises) or write a one-off converter from `buildDesignGraph`-style records (shape, binding) to this format; the graph already carries ids, types, labels, positions and edges. Recommended: drop, and bump `version` for later format changes.
- The export keeps the id of the node as the Design Graph id (`n-xxxxxxxx`), instead of `shape:xxxx`. Not checked: whether a prompt or a test outside the export reads the `shape:` prefix (#43 to confirm).
- Design Graph kinds: groups export as `frame`, notes as annotation kind `note`. `nearestNodeId` reuses the 200 unit reach of the tldraw export (`NEAREST_NODE_MAX_DISTANCE`).

## License, attribution, CSP

- **React Flow**: `@xyflow/react` 12.12.0 (published 2026-09-24) and `@xyflow/system` 0.0.83 are MIT. Added dependencies and licenses (all in the production tree): `classcat` 5.0.5 (MIT), `zustand` 4.5.7 (MIT), `@xyflow/system` and `@xyflow/react` (MIT), `html-to-image` 1.11.13 (MIT, no dependencies). The d3 packages React Flow needs (`d3-drag`, `d3-zoom`, `d3-selection`, `d3-interpolate`...: ISC, BSD-3-Clause, and their `@types`) were already in the tree through Mermaid. Pins are exact (`12.12.0`, `1.11.13`), more than two weeks old.
- `npm run licenses:build` was run: **`resources/licenses.json` changed** (+60 lines: the five new packages with their license texts) and `npm run licenses:check` passes. `npm test` fails while that file is stale.
- **Attribution badge**: kept, `proOptions` is not set. The page of React Flow says the MIT license does not require it, calls it "a small way you can give back to the team" and ties its removal to a Pro subscription. It costs a 12 px chip in the corner, and the project is open source and personal. It styles with tokens (`--xy-attribution-background-color`). The off-screen PNG capture leaves React Flow's panels out of the image (the Design Export is an image for the LLM, not UI), which does not touch the one on screen. The About screen lists the packages with their license text through `licenses.json` like any other.
- **tldraw**: not removed in the spike. Once #43 removes it: its license file, `check-tldraw-key`, the CI secret, the `.env` key, the watermark tracking question in [[Design Canvas Integration]] and [[Packaging]] all go.
- **CSP** (`src/renderer/index.html`: `default-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self' data:`, `connect-src 'self' data:`): no change needed, no remote origin used. React Flow ships its CSS in the bundle and loads nothing; the PNG capture embeds the page fonts through `data:` URLs and draws an SVG `data:` image, both allowed. No CSP violation or console warning in the dev run, nor in the `file://` run.

## Bundle size

`npm run build`, renderer, before and after (tldraw still bundled, so this is the **added** cost):

| File | Before | After | Delta |
|---|---|---|---|
| `index-*.js` | 9,361.53 kB (3,083,303 B gzip) | 9,444.20 kB (3,102,972 B gzip) | +82.7 kB (+19.7 kB gzip) |
| `index-*.css` | 414.31 kB (203,649 B gzip) | 439.54 kB (207,945 B gzip) | +25.2 kB (+4.3 kB gzip) |
| `out/renderer` | 20,032 kB | 20,068 kB | +36 kB |

Removing tldraw and `@tldraw/assets` (inlined fonts, icons, translations) in #43 will shrink the bundle far below the starting point; tldraw is the bulk of the 9.4 MB.

## Estimated size of the migration (#43)

Spike code that carries over as is: `scene.ts`, `exportGraph.ts`, `flowModel.ts`, `history.ts`, `pngLayout.ts`, `exportPng.tsx`, `FlowCanvas.tsx`, nodes, edge, `EditableText`, CSS: about 1,250 lines (270 of them CSS) plus 670 lines of tests and fixtures (52 tests). The existing tldraw side that goes: `componentShapes.tsx`, `DesignCanvas.tsx`, `assetUrls`, `sceneSnapshot`, `export/exportDesignGraph.ts`, `export/exportDesignPng.ts` and their tests, about 1,800 lines.

Work for #43, roughly 2 to 3 days:

1. Swap `DesignCanvas` for `FlowCanvas` in `ProtocolExerciseScreen` and `DesignCanvasDevScreen`, wire `loadDesignScene` / `saveDesignScene` through `deserializeScene` / `serializeScene` (the autosave is the one of the spike), `exportDesign` from `FlowCanvasHandle` (graph, description, PNG). IPC and `designGraph.ts` stay as they are.
2. Move `componentTypes.ts` (looks, colors) and the description renderer out of the tldraw-named folders; drop the copy of the drawings in `ComponentBody.tsx` vs `componentShapes.tsx`.
3. Remove tldraw: `package.json`, the license key scripts, CI secret, `electron.vite.config.ts` asset rules, `resources/licenses/tldraw-*`, the tldraw branches of `scripts/build-licenses.ts`, `src/main/about/licenses.ts`, About screen section, `.env.example`, smoke test checks; rebuild `licenses.json`.
4. Docs and glossary in the same change: [[Design Canvas]] ("React Flow canvas", no longer "tldraw whiteboard"), [[Design Scene]] (stored scene format), [[Design Graph]] (edges from connections, no binding records), [[Design Canvas Integration]], [[Design Export]], [[Packaging]], [[Attribution and Licenses]], SPEC section 10. The spike changes no term, so the glossary is untouched here.
5. Product polish left out of the spike: "Group selection" action, drag from the palette, label on connection at creation, F2 / Enter to edit the selected node, keyboard resize, a minimap, alignment guides, a move of the PNG capture into a hidden `BrowserWindow` if it must run while the window is not visible.
6. Tests to add with the integration: the screen-level load error, IPC round trip of a scene, the exercise completion rule if it reads the scene.

## Not verified

- A packaged app (`npm run package`) was not built; the built renderer ran from `file://` through `electron-vite preview` with a temporary build that exposed the dev screen, reverted afterwards.
- No Windows or Linux run; no trackpad pinch (only mouse events and keys were sent).
- Performance with hundreds of nodes; `onlyRenderVisibleElements` was not tried.
- Real macOS keyboard path of Cmd+C / Cmd+V into the system clipboard: the clipboard is in memory, per canvas.
- Screen reader and keyboard-only use of the nodes (not tried; the shortcuts above are the only keyboard path written).
- React Flow 13 is in `next` (13.0.0-next.0 on 2026-10-11): not evaluated, 12.12.0 is the pinned line.
