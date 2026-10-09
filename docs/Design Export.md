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

Background: [[Design Canvas Integration]], [[tldraw|tldraw spike]] (section 4, gotchas).

## Code

| Path | Role |
|---|---|
| `src/shared/designGraph.ts` | Component type list (the shape catalogue), zod schemas and types: `designGraphSchema`, `designPngSchema`, `designExportSchema`, `DesignExportSummary`. No tldraw import (the main process uses it too). |
| `src/renderer/src/design/export/exportDesignGraph.ts` | `exportDesignGraph(editor \| editorSnapshot \| storeSnapshot)`, and the pure `buildDesignGraph(records, pageId, options)` behind it. |
| `src/renderer/src/design/export/describeDesignGraph.ts` | `describeDesignGraph(graph)`: the text description. |
| `src/renderer/src/design/export/exportDesignPng.ts` | `exportDesignPng(editor, { maxSide })`: PNG as base64. |
| `src/renderer/src/design/export/index.ts` | `exportDesign(editor, designExerciseId)`: all three, ready for IPC. |
| `src/renderer/src/design/export/fixtureScenes.ts` | Hand-built tldraw records for the tests. |
| `src/main/ipc/design.ts` | `exportScene`: handler of `design:exportScene`. |
| `src/renderer/src/dev/DesignExportDevPanel.tsx` | Dev panel on the "Design canvas (dev)" screen: Export button, summary from the main process, description, PNG preview, JSON. |

## Design Graph schema (version 1)

```ts
interface DesignGraph {
  version: 1
  nodes: Array<{
    id: string                 // tldraw shape id, stable for a scene
    componentType: 'client' | 'cdn' | 'load-balancer' | 'service' | 'cache' | 'database' | 'queue'
    label: string              // the text inside the shape, trimmed ('' when empty)
    position?: { x: number; y: number }  // page coordinates, top-left, rounded
    size?: { w: number; h: number }
  }>
  edges: Array<{               // arrows bound to a node at both ends
    id: string
    from: string               // node id at the arrow tail (start binding)
    to: string                 // node id at the arrow head (end binding)
    label: string
    direction: 'forward' | 'backward' | 'both' | 'none'  // from the arrowheads
  }>
  annotations: Array<{         // any other shape with text: text, note, labelled geo box...
    id: string
    kind: string               // tldraw shape type ('text', 'note', 'geo'...)
    text: string
    position?: { x: number; y: number }
    nearestNodeId: string | null  // closest node within 200 page units
  }>
  danglingArrows: Array<{      // arrows not bound to a node at one end or both
    id: string
    from: string | null
    to: string | null
    label: string
  }>
  groups: Array<{              // tldraw frames and groups
    id: string
    kind: 'frame' | 'group'
    label: string              // frame name, '' for a group
    memberIds: string[]        // nodes and annotations inside, at any depth
  }>
}
```

The zod schema also checks that ids are unique, that every edge, dangling arrow end, `nearestNodeId` and group member points at an existing node (or annotation, for group members), and that a dangling arrow really lacks a node at one end.

## Rules

- **Connections come from binding records only.** A bound arrow's `props.start` / `props.end` go stale once a shape moves (spike, gotcha 1), so they are never read. The `start` binding gives `from`, the `end` binding gives `to`.
- **Only catalogue shapes are nodes.** An arrow bound to an annotation, to another arrow, to a deleted shape, or not bound at all is a dangling arrow, with `null` for the end that has no node. Dangling arrows are reported, never turned into edges, so the evaluation can flag them.
- **Annotations**: every non-component, non-arrow, non-frame shape that carries text (`text`, rich text or a frame name). Shapes without text (freehand strokes, empty boxes) are left out: there is nothing to read. The nearest node is measured from the centre of the shape's page bounds as the editor measures them; from a stored snapshot (no editor), from its props (text shapes store no height, so their top-left corner is used; notes use tldraw's 200 x 200 size).
- **Positions** are page coordinates: parent offsets of frames and groups are summed. Rotation is ignored.
- **Page**: the current page of the editor, or the session's current page of a snapshot (else the first page).
- **Deterministic**: the same scene always gives the same JSON. Nodes, annotations and groups are sorted top to bottom, left to right, then by id; edges by the order of their `from` node, then `to` node, label and id; dangling arrows likewise; positions are rounded (never `-0`). Ids are the tldraw shape ids, so a Design Feedback can point back at a shape.

## Text description

`describeDesignGraph` gives the structure at a glance, for the prompt:

- Components list, in graph order. Nodes with the same type, label and connections are collapsed (`3x Service`). Other nodes sharing a label are numbered (`Service #1`). A type hint is added when the label is not the type's default label (`Users DB (database)`); an empty label reads `unlabeled <type>`.
- Connections as chains: `A -> B -> C, D`. An edge label shows inside the arrow (`-[HTTPS]->`); `<-`, `<->` and `--` show the other directions. A chain continues through a component that has exactly one incoming and one outgoing line.
- `Not connected:` components without edges, `Arrows not connected at both ends:`, `Notes:` with the nearest component, `Groups:` with their members.
- An empty scene reads `Empty design: no components.`

## PNG

- The shapes of the current page, through tldraw's `editor.toImage` (format `png`, light mode, no background, fixed 32 px padding), then flattened on an **opaque white** background on an `OffscreenCanvas`.
- **Longest side at most 1568 px** (`DESIGN_PNG_MAX_SIDE`). Claude downscales images whose long edge is over 1568 px, so a larger image only costs bytes and tokens. Small scenes render at a 2x pixel ratio for sharp text; large ones at the ratio that lands near 1568 px, so no huge intermediate canvas is built; the final draw clamps to the limit in any case (arrowheads or labels can overflow the shape bounds).
- Encoded as plain base64 (no `data:` prefix) with its width and height. `null` for an empty page (tldraw cannot rasterize nothing).
- The tldraw dev watermark is not part of exports (spike, section 1).

## IPC: `design:exportScene`

`window.api.exportDesignScene(designExport)` sends `{ designExerciseId, graph, description, png }` to the main process. The main process does not trust the renderer: it parses the whole payload with `designExportSchema` (graph checks above, description up to 100,000 characters, PNG must be base64 starting with the PNG signature, at most 1568 px per side, 20 MB of base64). It only answers a `DesignExportSummary` (counts of nodes, edges, annotations, dangling arrows, groups, and decoded PNG bytes); nothing is stored. The evaluation receives the export with a step submission instead (`protocol:submitStep`, validated with the same schema): the description, the graph without positions and sizes, and the PNG sent to the model as an image. See [[Interview Protocol Implementation]].

## Example

The design drawn during the in-app check below, ids shortened:

```json
{
  "version": 1,
  "nodes": [
    { "id": "shape:client", "componentType": "client", "label": "Client",
      "position": { "x": 45, "y": 97 }, "size": { "w": 160, "h": 100 } },
    { "id": "shape:lb", "componentType": "load-balancer", "label": "Load balancer",
      "position": { "x": 375, "y": 102 }, "size": { "w": 160, "h": 90 } },
    { "id": "shape:svc", "componentType": "service", "label": "Service",
      "position": { "x": 375, "y": 322 }, "size": { "w": 160, "h": 90 } },
    { "id": "shape:db", "componentType": "database", "label": "Users DB",
      "position": { "x": 375, "y": 532 }, "size": { "w": 160, "h": 110 } }
  ],
  "edges": [
    { "id": "shape:a1", "from": "shape:client", "to": "shape:lb", "label": "", "direction": "forward" },
    { "id": "shape:a2", "from": "shape:lb", "to": "shape:svc", "label": "", "direction": "forward" },
    { "id": "shape:a3", "from": "shape:svc", "to": "shape:db", "label": "", "direction": "forward" }
  ],
  "annotations": [
    { "id": "shape:t1", "kind": "text", "text": "Primary only, no replica yet",
      "position": { "x": 185, "y": 581 }, "nearestNodeId": "shape:db" }
  ],
  "danglingArrows": [
    { "id": "shape:a4", "from": "shape:svc", "to": null, "label": "" }
  ],
  "groups": []
}
```

Its text description:

```text
Components (4): Client, Load balancer, Service, Users DB (database)
Connections:
- Client -> Load balancer -> Service -> Users DB
Arrows not connected at both ends:
- Service -> (nothing)
Notes:
- "Primary only, no replica yet" (near Users DB)
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

## Verification (2026-10-09)

- Unit tests (Vitest, fixture scenes in `fixtureScenes.ts`): chain, branching, stale arrow props, arrow bound at one end, arrows bound to an annotation, to another arrow or to a deleted shape, annotations (text, note, labelled geo; unlabelled shapes left out), frames, page filter, arrowhead directions, empty scene, determinism (two exports, reversed and cloned input give the same JSON), snapshot and editor inputs, schema rejections, PNG size and base64 helpers, main-side handler.
- In the app (dev server, Chrome DevTools protocol, scratch `--user-data-dir`): 4 palette shapes, 3 arrows drawn with the arrow tool, 1 arrow with a free end, a renamed label and a text note, all with real mouse and keyboard input. The export JSON matched the drawing; the main process answered 4 nodes, 3 edges, 1 annotation, 1 dangling arrow, PNG about 90 kB; the PNG preview showed the scene on white (1108 x 1218). After dragging the Service shape, the bound arrows followed and the export still had the same 3 edges; two exports in a row gave identical JSON, description and PNG.
- Not checked in the app: frames and groups, an empty page (PNG `null`), a scene large enough to hit the 1568 px clamp (covered by the `fitWithin` unit test only), a packaged build.

## Related

- [[Design Graph]], [[Design Scene]], [[Design Canvas]], [[Design Feedback]], [[Design Exercise]]
- Evaluation prompt: [[Interview Protocol Implementation]] (#14)
