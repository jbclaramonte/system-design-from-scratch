---
title: Design Graph
tags: [concept, design-practice]
---

# Design Graph

The structured, versioned export of a [[Design Scene]]: nodes (component shapes of the [[Design Canvas]] catalogue), edges (arrows bound to a node at both ends), annotations (any other shape with text, with its nearest node), dangling arrows (not bound to a node at one end or both) and groups (frames and tldraw groups). It is what the LLM reads to give [[Design Feedback]], next to a text description and a PNG.

## Related

- Built from a [[Design Scene]]
- Part of a [[Design Export]]
- Read by the [[Generation]] that produces [[Design Feedback]]

## In code

Schema and types (zod, no tldraw import): `src/shared/designGraph.ts`. Built by `exportDesignGraph` / `buildDesignGraph` in `src/renderer/src/design/export/exportDesignGraph.ts`, described as text by `describeDesignGraph`. See [[Design Export]].
