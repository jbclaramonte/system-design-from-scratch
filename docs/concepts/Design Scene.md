---
title: Design Scene
tags: [concept, design-practice]
---

# Design Scene

The saved state of a [[Design Canvas]] for one [[Design Exercise]]: its nodes (typed components, notes, groups), edges (connections with a direction and a label) and view, stored as versioned JSON (`version: 1`). One scene per exercise; a scene saved by the earlier tldraw canvas is converted when it is opened. It is restored when the user comes back and exported (structured graph JSON plus PNG) when a [[Generation]] evaluates the design.

## Related

- Belongs to a [[Design Exercise]]
- Holds the content of the [[Design Canvas]]
- Evaluated per [[Protocol Step]]

## In code

Table `design_scenes`, see [[Data Model]]. IPC `design:loadScene` / `design:saveScene` (`src/main/ipc/design.ts`), format and validation in `src/renderer/src/design/flow/scene.ts`, reading (and conversion of legacy tldraw scenes) in `storedScene.ts` and `legacy/tldrawScene.ts`, debounced autosave in `DesignCanvas.tsx`. See [[Design Canvas Integration]]. Exported as a [[Design Graph]] (plus text description and PNG) by `src/renderer/src/design/export/`, handed to the main process over `design:exportScene`: see [[Design Export]].
