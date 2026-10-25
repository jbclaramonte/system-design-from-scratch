---
title: Learning Path
tags: [concept, learning-content]
---

# Learning Path

The linear sequence: [[Foundations Module]], then [[Topic]]s, then [[Design Exercise]]s. Each step unlocks when the previous one is mastered. The screen draws it as a roadmap of nodes ([[Learning Path Implementation#Roadmap of nodes]]).

## Related

- Contains [[Foundations Module]], [[Topic]], [[Design Exercise]]
- Unlock rule uses [[Mastery Threshold]]
- A locked step can be opened by a [[Forced Unlock]] (no credit); a topic can be mastered by [[Declared Mastery]]

## In code

`src/main/path/`: pure `buildLearningPath` (`model.ts`), Design Exercise prerequisites (`designExercisePrerequisites.ts`), `path:get` and the `path:changed` push (`pathIpc.ts`), topic and exercise locks (`lock.ts`); types in `src/shared/learningPath.ts`. Home screen in `src/renderer/src/path/`; an available Design Exercise opens the protocol screen. `buildLearningPath` also takes the [[Forced Unlock]]s, and counts a [[Declared Mastery]] as mastered. See [[Learning Path Implementation]] and [[Design Exercises]].
