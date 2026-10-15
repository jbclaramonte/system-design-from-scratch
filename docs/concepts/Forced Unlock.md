---
title: Forced Unlock
tags: [concept, learning-content]
issue: 54
---

# Forced Unlock

The learner opens one locked step of the [[Learning Path]] (a [[Topic]] or a [[Design Exercise]]) without mastering what comes before it, with "Unlock anyway" and a confirmation that says the step opens without credit. A learner who already knows the basics, or who wants to try an advanced exercise now, no longer has to master every prerequisite topic first.

A Forced Unlock opens **that one step only**:

- no mastery credit: the prerequisite topics stay not mastered, and the screen keeps saying which ones ("Opened without credit: ... not mastered");
- the steps after it stay locked, and the progress counters (mastered topics, percent, unlocked exercises) and the recommended step are unchanged;
- it is stored, so it survives a restart;
- it is undone with "Lock again" while the step has no progress; a step with progress is never locked again, as before;
- it stops being flagged once the step is unlocked by the rules anyway (the previous topic is mastered).

Unlocking a Design Exercise gives access to all of its [[Protocol Step]]s active at its position: they unlock by exercise index, not by earlier submissions, so the architecture steps of an advanced exercise can be played directly.

Not the same as [[Declared Mastery]], which marks a topic mastered ("I already know this") and so changes the progress and unlocks the following topics.

## Related

- Applies to a step of the [[Learning Path]]; enforced in the main process by the topic and exercise lock guards
- Gives no [[Mastery Threshold]] credit: the [[Mastery Loop]] is untouched

## In code

Table `forced_unlocks` (migration 6, one row per step key such as `topic:<slug>` or `design_exercise:<slug>`), repository `src/main/db/repositories/forcedUnlocks.ts`. `buildLearningPath` takes `forcedUnlocks` and sets `forcedUnlock: true` on the step (`src/main/path/model.ts`); `path:forceUnlock` and `path:lockAgain` (`src/main/path/pathIpc.ts`); the guards in `src/main/path/lock.ts` need no change: a forced step is `available`, not `locked`. UI in `src/renderer/src/path/LearningPathScreen.tsx`. See [[Learning Path Implementation#Forced Unlock]] and [[Data Model]].
