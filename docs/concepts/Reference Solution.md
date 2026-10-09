---
title: Reference Solution
tags: [concept, design-practice]
---

# Reference Solution

The primer's solution to a [[Design Exercise]]. Used for the final comparison with the user's design.

## Related

- Compared against the user's work in a [[Design Exercise]]

## In code

- `ReferenceSolution` in `src/main/corpus/types.ts`, parsed by `parseSolution` in `src/main/corpus/ingest.ts`, bundled in `resources/corpus/primer.json`. See [[Corpus]].
- Hidden grounding of step feedback and [[Hint]]s (never quoted), compared openly in the final review: `referencePart` in `src/main/generation/prompts/designFeedback.ts`. A Design Exercise points to it with `design_exercises.reference_solution_section`. See [[Interview Protocol Implementation]].
- Cut to the parts that answer the Protocol Steps being judged (use cases, constraints and usage, core components, scaling...): `referenceForSteps` in `src/main/protocol/reference.ts`. See [[Design Exercises#Reference Solution in the prompts]].
