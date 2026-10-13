---
title: Design Canvas
tags: [concept, design-practice]
---

# Design Canvas

The embedded React Flow canvas with a library of typed components (client, CDN, load balancer, service, cache, database, queue) that the user connects, plus notes and groups. Exported as structured JSON plus a PNG capture for LLM evaluation. It replaced a tldraw whiteboard (issue #43).

## Related

- Used in a [[Design Exercise]]
- Evaluated through a [[Generation]]

## In code

Component `DesignCanvas` in `src/renderer/src/design/` (the editor in `flow/`, catalogue of component types `componentTypes.ts`). Scenes stored in table `design_scenes`, repository `src/main/db/repositories/designPractice.ts`. Export for the LLM (graph JSON, text description, PNG) in `src/renderer/src/design/export/`, see [[Design Export]]. See [[Design Canvas Integration]] and [[Data Model]].
