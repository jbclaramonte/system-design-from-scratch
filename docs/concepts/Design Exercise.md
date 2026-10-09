---
title: Design Exercise
tags: [concept, design-practice]
---

# Design Exercise

A hands-on system design problem solved on the [[Design Canvas]], for example a URL shortener. Starting catalogue: the primer's 8 solutions. Follows the [[Interview Protocol]], unlocked step by step.

## Related

- Uses the [[Interview Protocol]]
- Compared to a [[Reference Solution]]
- Final stage of the [[Learning Path]]

## In code

- Catalogue `DESIGN_EXERCISES` in `src/main/protocol/designExercises.ts` (order index, title, curated French problem statement, Reference Solution), seeded into `design_exercises` at startup by `seedDesignExercises`. See [[Design Exercises]].
- Table `design_exercises` (with `problem_statement`), repository `src/main/db/repositories/designPractice.ts`. See [[Data Model]].
- Its exercise index (the order index of the catalogue) decides its active Protocol Steps: `exerciseIndexOf` in `src/main/protocol/exercises.ts`, screen `src/renderer/src/design/protocol/ProtocolExerciseScreen.tsx`, opened from the [[Learning Path]]. See [[Interview Protocol Implementation]].
- Status on the path (`locked`, `available`, `in_progress`, `completed`, `coming_soon`): `buildLearningPath` in `src/main/path/model.ts`.
