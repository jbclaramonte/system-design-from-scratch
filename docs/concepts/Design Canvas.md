---
title: Design Canvas
tags: [concept, design-practice]
---

# Design Canvas

The embedded tldraw whiteboard with a library of typed shapes (load balancer, cache, DB, queue). Exported as structured JSON plus a PNG capture for LLM evaluation.

## Related

- Used in a [[Design Exercise]]
- Evaluated through a [[Generation]]

## In code

Component `DesignCanvas` and the typed shapes in `src/renderer/src/design/` (catalogue `componentTypes.ts`, tldraw shapes `componentShapes.tsx`). Snapshots stored in table `design_scenes`, repository `src/main/db/repositories/designPractice.ts`. See [[Design Canvas Integration]] and [[Data Model]].
