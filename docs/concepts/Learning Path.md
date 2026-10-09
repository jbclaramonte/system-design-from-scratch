---
title: Learning Path
tags: [concept, learning-content]
---

# Learning Path

The linear sequence: [[Foundations Module]], then [[Topic]]s, then [[Design Exercise]]s. Each step unlocks when the previous one is mastered.

## Related

- Contains [[Foundations Module]], [[Topic]], [[Design Exercise]]
- Unlock rule uses [[Mastery Threshold]]

## In code

`src/main/path/`: pure `buildLearningPath` (`model.ts`), Design Exercise prerequisites (`designExercisePrerequisites.ts`), `path:get` and the `path:changed` push (`pathIpc.ts`); types in `src/shared/learningPath.ts`. Home screen in `src/renderer/src/path/`. See [[Learning Path Implementation]].
