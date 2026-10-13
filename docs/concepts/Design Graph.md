---
title: Design Graph
tags: [concept, design-practice]
---

# Design Graph

The structured, versioned export of a [[Design Scene]]: nodes (typed components of the [[Design Canvas]] catalogue), edges (connections between two components), annotations (the notes with text, with their nearest component), dangling arrows (connections without a component at one end or both, in practice to a note) and groups (the frames of the canvas). It is what the LLM reads to give [[Design Feedback]], next to a text description and a PNG.

## Related

- Built from a [[Design Scene]]
- Part of a [[Design Export]]
- Read by the [[Generation]] that produces [[Design Feedback]]

## In code

Schema and types (zod, no renderer import): `src/shared/designGraph.ts`. Built by `exportDesignGraph(scene)` in `src/renderer/src/design/export/exportDesignGraph.ts`, described as text by `describeDesignGraph`. See [[Design Export]].
