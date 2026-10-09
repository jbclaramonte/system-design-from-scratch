---
title: Pre-generation
tags: [concept, generation]
---

# Pre-generation

A [[Generation]] started in the background before the learner needs its result, for example the [[Quiz]] while the [[Lesson]] is being read. It waits behind foreground Generations, is cancellable, and its result goes to the [[Content Cache]], where the later foreground request finds it.

## Related

- A background [[Generation]]
- Fills the [[Content Cache]]
- Typical case: the [[Quiz]] of the [[Topic]] whose [[Lesson]] is open

## In code

`GenerationService.pregenerate()` and `cancelPregenerations()` in `src/main/generation/service.ts`, priority `background` (`GenerationPriority` in `src/shared/generation.ts`), scheduling in `src/main/generation/queue.ts`. See [[Generation Service]].
