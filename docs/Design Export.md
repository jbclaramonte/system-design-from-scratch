---
title: Design Export
tags: [design-practice, architecture]
issue: 13
graph-version: 1
---

# Design Export

**Design Export** (glossary term): what one [[Design Scene]] hands to the evaluation that produces [[Design Feedback]] (issue #14). It has three parts:

1. the [[Design Graph]], structured JSON validated with zod;
2. a compact **text description** of that graph, put into the prompt next to the JSON;
3. a **PNG capture** of the [[Design Canvas]] page.

Background: [[Design Canvas Integration]], [[react-flow|React Flow spike]]. Before issue #43 the export read tldraw records ([[tldraw|tldraw spike]]); the contract below did not change.

## Code

| Path | Role |
|---|---|
| `src/shared/designGraph.ts` | Component type list (the catalogue), zod schemas and types: `designGraphSchema`, `designPngSchema`, `designExportSchema`, `DesignExportSummary`. No renderer import (the main process uses it too). |
| `src/renderer/src/design/export/exportDesignGraph.ts` | `exportDesignGraph(scene)`: Design Graph straight from the nodes and edges of a Design Scene (the live canvas gives it through `FlowCanvasHandle.getScene()`, a stored scene works as well). Pure: no React, no DOM, no React Flow import. |
| `src/renderer/src/design/export/describeDesignGraph.ts` | `describeDesignGraph(graph)`: the text description. |
| `src/renderer/src/design/export/exportDesignPng.tsx` | `exportDesignPng(scene)`: PNG as base64, drawn by an off-screen light canvas and captured with `html-to-image`. |
| `src/renderer/src/design/export/pngLayout.ts`, `pngEncoding.ts` | Pure framing and pixel ratio of the capture, size clamp and base64 helpers. |
| `src/renderer/src/design/export/index.ts` | `exportDesign(scene, designExerciseId)`: all three, ready for IPC. |
| `src/main/ipc/design.ts` | `exportScene`: handler of `design:exportScene`. |
| `src/renderer/src/dev/DesignExportDevPanel.tsx` | Dev panel on the "Design canvas (dev)" screen: Export button, summary from the main process, description, PNG preview, JSON. |

## Design Graph schema (version 1)

```ts
interface DesignGraph {
  version: 1
  nodes: Array<{
    id: string                 // node id of the Design Scene, stable for a scene
    componentType: 'client' | 'cdn' | 'load-balancer' | 'service' | 'cache' | 'database' | 'queue'
    label: string              // the text inside the node, trimmed ('' when empty)
    position?: { x: number; y: number }  // canvas coordinates, top-left, rounded
    size?: { w: number; h: number }
  }>
  edges: Array<{               // connections between two components
    id: string
    from: string               // component id at the tail (`source` of the edge)
    to: string                 // component id at the head (`target` of the edge)
    label: string
    direction: 'forward' | 'backward' | 'both' | 'none'  // stored on the edge
  }>
  annotations: Array<{         // any other node with text: the notes of the canvas
    id: string
    kind: string               // node type: 'note' (a free string, older exports had 'text', 'geo'...)
    text: string
    position?: { x: number; y: number }
    nearestNodeId: string | null  // closest component within 200 canvas units
  }>
  danglingArrows: Array<{      // connections without a component at one end or both
    id: string
    from: string | null
    to: string | null
    label: string
  }>
  groups: Array<{              // the groups of the canvas
    id: string
    kind: 'frame' | 'group'   // always 'frame' on the React Flow canvas ('group' stays valid)
    label: string              // group title
    memberIds: string[]        // components and annotations inside, at any depth
  }>
}
```

The zod schema also checks that ids are unique, that every edge, dangling arrow end, `nearestNodeId` and group member points at an existing node (or annotation, for group members), and that a dangling arrow really lacks a node at one end.

**Version stays 1.** Moving from tldraw to React Flow changed no field: the node ids are now the ids of the scene (`n-xxxxxxxx`, or `shape:xxxx` for a converted tldraw scene), annotations are `note`, groups are `frame`, and `kind` was already a free string. Tests and prompts elsewhere keep their `shape:` ids as plain strings. If a field ever changes, bump `DESIGN_GRAPH_VERSION` with the zod schema and this note.

## Rules

- **Connections are the edges of the scene.** `source` is `from`, `target` is `to`; there are no binding records to chase and no stale endpoints.
- **Only component nodes are nodes.** A connection to a note (or to a node that is not in the scene) is a dangling arrow, with `null` for the end that has no component. Dangling arrows are reported, never turned into edges, so the evaluation can flag them. The React Flow canvas has no free-floating arrow, so this only happens with a note.
- **Annotations**: the notes with text. A note without text carries nothing to read and is left out (new notes start empty). The nearest component is measured from the center of the note to the rectangle of each component, within 200 units (`NEAREST_NODE_MAX_DISTANCE`); sizes are always stored.
- **Positions** are canvas coordinates: parent offsets of groups are summed (a node is stored relative to its group). Rounded, never `-0`.
- **Deterministic**: the same scene always gives the same JSON, in any array order. Nodes, annotations and groups are sorted top to bottom, left to right, then by id; edges by the order of their `from` node, then `to` node, label and id; dangling arrows likewise. Ids are the node ids, so a Design Feedback can point back at a node.
- The result is parsed with `designGraphSchema` before it leaves the renderer: if the mapping ever drifts, it fails there and not in the main process.

## Text description

`describeDesignGraph` gives the structure at a glance, for the prompt:

- Components list, in graph order. Nodes with the same type, label and connections are collapsed (`3x Service`). Other nodes sharing a label are numbered (`Service #1`). A type hint is added when the label is not the type's default label (`Users DB (database)`); an empty label reads `unlabeled <type>`.
- Connections as chains: `A -> B -> C, D`. An edge label shows inside the arrow (`-[HTTPS]->`); `<-`, `<->` and `--` show the other directions. A chain continues through a component that has exactly one incoming and one outgoing line.
- `Not connected:` components without edges, `Arrows not connected at both ends:`, `Notes:` with the nearest component, `Groups:` with their members.
- An empty scene reads `Empty design: no components.`

## PNG

- Drawn by a **second, off-screen React Flow in the `export` mode** (dark strokes on white, literal colors), not by the live canvas: the theme of the app cannot leak into the image, the live canvas does not flash, and it works from a scene without the editor being mounted. Captured with `html-to-image` (`toCanvas`), then flattened on an **opaque white** background.
- Fixed 32 px padding, so the same scene gives the same framing. React Flow's own panels (attribution, controls) are left out of the capture.
- **Longest side at most 1568 px** (`DESIGN_PNG_MAX_SIDE`). Claude downscales images whose long edge is over 1568 px, so a larger image only costs bytes and tokens. Small scenes render at a 2x pixel ratio for sharp text; large ones at the ratio that lands near 1568 px; the final draw clamps to the limit in any case (`fitWithin`). A very wide scene shrinks to small text, as it did with tldraw.
- Nothing a node draws may take its color from the stylesheet ([[Design Canvas Integration#Visual design]]): the capture would resolve it in the theme of the app.
- **The same PNG in both themes (#63).** The colors are literal, but the stylesheet rules the export frame sits under read tokens that differ by theme (the sans font above all, also sizes and radii): the off-screen host is pinned to the dark tokens (`data-theme="dark"`, `EXPORT_TOKENS_THEME` in `flow/flowTheme.ts`). Checked in the dev build with the scratch export screen: the same scene exported with the app in Light, then Dark, then Light again gave byte-identical PNGs; without the pin, Light and Dark differed (the font). `flowTheme.test.ts` pins the parts that can be tested without a browser: the `export` palette and component colors hold no token, and are the values the PNG always had.
- Encoded as plain base64 (no `data:` prefix) with its width and height. `null` for an empty scene.
- The export waits for the off-screen canvas to be measured and painted. A hidden window never paints, so it fails after 10 s with "PNG export timed out: is the window visible?".
- Needs no network: the page fonts are embedded as `data:` URLs and the SVG image is a `data:` URL, covered by `font-src` and `img-src` (CSP `connect-src 'self'`).

## IPC: `design:exportScene`

`window.api.exportDesignScene(designExport)` sends `{ designExerciseId, graph, description, png }` to the main process. The main process does not trust the renderer: it parses the whole payload with `designExportSchema` (graph checks above, description up to 100,000 characters, PNG must be base64 starting with the PNG signature, at most 1568 px per side, 20 MB of base64). It only answers a `DesignExportSummary` (counts of nodes, edges, annotations, dangling arrows, groups, and decoded PNG bytes); nothing is stored. The evaluation receives the export with a step submission instead (`protocol:submitStep`, validated with the same schema): the description, the graph without positions and sizes, and the PNG sent to the model as an image. See [[Interview Protocol Implementation]].

## Example

A trimmed Design Graph of the architecture drawn for the in-app check below (ids shortened, four of the seven components):

```json
{
  "version": 1,
  "nodes": [
    { "id": "client", "componentType": "client", "label": "Client",
      "position": { "x": 0, "y": 100 }, "size": { "w": 160, "h": 90 } },
    { "id": "lb", "componentType": "load-balancer", "label": "Load balancer",
      "position": { "x": 200, "y": 100 }, "size": { "w": 160, "h": 90 } },
    { "id": "a", "componentType": "service", "label": "Auth service",
      "position": { "x": 420, "y": 60 }, "size": { "w": 160, "h": 90 } },
    { "id": "db", "componentType": "database", "label": "Users DB",
      "position": { "x": 860, "y": 120 }, "size": { "w": 160, "h": 110 } },
    { "id": "cache", "componentType": "cache", "label": "Cache",
      "position": { "x": 860, "y": 300 }, "size": { "w": 160, "h": 90 } }
  ],
  "edges": [
    { "id": "e1", "from": "client", "to": "lb", "label": "HTTPS", "direction": "forward" },
    { "id": "e2", "from": "lb", "to": "a", "label": "", "direction": "forward" },
    { "id": "e4", "from": "a", "to": "db", "label": "SQL", "direction": "both" }
  ],
  "annotations": [
    { "id": "n", "kind": "note", "text": "Reads are ~100x writes",
      "position": { "x": 700, "y": 420 }, "nearestNodeId": "cache" }
  ],
  "danglingArrows": [],
  "groups": [{ "id": "g", "kind": "frame", "label": "Backend", "memberIds": ["a"] }]
}
```

The text description of the full seven-component architecture of that check:

```text
Components (7): Auth service (service), Client, Load balancer, Users DB (database), Order service (service), Cache, Jobs (queue)
Connections:
- Auth service <-[SQL]-> Users DB
- Client -[HTTPS]-> Load balancer -> Auth service, Order service
- Order service <- Cache
- Order service -[enqueue]- Jobs
Notes:
- "Reads are ~100x writes" (near Cache)
Groups:
- frame "Backend": Auth service, Order service
```

A branching scene (from the tests) reads:

```text
Components (7): 3x Service, Cache, Client, Load balancer, Database
Connections:
- Client -[HTTPS]-> Load balancer -> 3x Service -> Cache, Database
Notes:
- "Reads are ~100x writes" (near Cache)
- "Single region for now"
```

## Verification

- Unit tests (Vitest): `export/exportDesignGraph.test.ts` (chain, branching, annotations with nearest component, empty notes left out, groups and offsets, dangling edges to a note or to an unknown node, self loop and parallel edges, directions, empty scene, determinism across array order, rounding and `-0`), `describeDesignGraph.test.ts`, `pngLayout.test.ts`, `pngEncoding.test.ts`, the schema tests in `src/shared/designGraph.test.ts` and the main-side handler. The fixtures of the old tldraw tests were ported to scene fixtures (`flow/sceneFixtures.ts`), and also feed the converter tests (`legacy/tldrawFixtures.ts`).
- In the app (issue #43, dev server and packaged app, scratch `--user-data-dir`, real mouse and keyboard): the dev panel exported the seven-component architecture (main process answered 7 nodes, 6 edges, 1 annotation, 0 dangling arrows, 1 group, PNG about 80 kB, 1568 x 844, readable text, arrowheads on the right ends, group border dashed, opaque white). A step submitted from exercise 1 reached the model call with the graph, description and notes; the PNG read from the CLI input was light and opaque, in the dev build and in the packaged `file://` app.
- Not checked: an empty canvas through the UI (the `null` PNG is covered by the unit tests and by the main-side schema), a scene wide enough to hit the 1568 px clamp in the browser (covered by `fitWithin` and the layout tests), the hidden-window timeout.

## Related

- [[Design Graph]], [[Design Scene]], [[Design Canvas]], [[Design Feedback]], [[Design Exercise]]
- Evaluation prompt: [[Interview Protocol Implementation]] (#14)
