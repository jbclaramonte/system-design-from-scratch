---
title: Declared Mastery
tags: [concept, assessment]
issue: 55
---

# Declared Mastery

A [[Topic]] the learner declared as already known ("I already know this", after a confirmation). It counts as mastered everywhere: the next topic of the [[Learning Path]] unlocks, [[Design Exercise]] prerequisites count it, and it is in the progress (Learning Path and [[Dashboard]]). It is shown with a small "declared" marker, so it stays distinct from a mastery earned by a [[Round]].

No Round, [[Attempt]] or notion score is invented: a Declared Mastery has none. The [[Notion Map]] shows its notions as "declared", not as a score, and [[Weak Point]]s and the statistics of Rounds are unchanged.

- **Test me**: the learner can still open the [[Lesson]] and play a [[Quiz]] on a declared topic at any time; it is the normal [[Mastery Loop]] and its scores appear in the Notion Map and the Weak Points like any Round.
- **Never revoked by a failure**: a later failed Round does not undo it (same rule as a topic mastered once). A passed Round makes the mastery an earned one (the "declared" marker goes away).
- **Undo**: removes the declaration while no Round was played on the topic after it; refused otherwise.
- Declaring a topic already mastered is a no-op. Only a topic that is open on the Learning Path can be declared (the main process refuses a locked one), so topics are declared in path order, each declaration unlocking the next.

Not the same as a [[Forced Unlock]], which only opens a locked step with no credit.

## Related

- Stands for a passed [[Round]] in the status of a topic: derived status `mastered`, with a `declared` flag true only when no Round met the [[Mastery Threshold]]
- Replaces a [[Round Limit]] or skipped state of the topic; the loop's own step is kept so "Test me" works
- Counts for the [[Learning Path]] unlock rule and for [[Dashboard]] progress, which shows how many mastered topics are declared

## In code

Table `declared_masteries` (migration 7, topic id and timestamp), repository functions in `src/main/db/repositories/mastery.ts`. The state machine stays pure: `deriveMastery` takes `declaredAt` as one more input and returns `status`, `declared`, `canDeclare` and `canUndoDeclaration` (`src/main/mastery/state.ts`, `cannotUndoDeclaration`). `declare` and `undoDeclaration` in `src/main/mastery/service.ts`, channels `mastery:declare` and `mastery:undoDeclaration`. UI: `src/renderer/src/mastery/DeclaredMastery.tsx`, the topic screen and the Learning Path screen. See [[Mastery Loop Implementation#Declared Mastery]] and [[Data Model]].
