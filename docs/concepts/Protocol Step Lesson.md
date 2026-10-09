---
title: Protocol Step Lesson
tags: [concept, design-practice]
---

# Protocol Step Lesson

The short "why it matters" lesson of a [[Protocol Step]]: what the step is, why skipping it hurts, what the learner will produce, one common pitfall. Shown the first time the learner meets the step (in any [[Design Exercise]]), then available on request. Generated in French, [[Grounding|grounded]] on the primer's interview method section, one per step, stored in the [[Content Cache]].

## Related

- Introduces a [[Protocol Step]] of the [[Interview Protocol]]
- Created by a [[Generation]], reused from the [[Content Cache]]
- Not a [[Lesson]] (which teaches a [[Topic]])

## In code

Prompt `buildProtocolStepLessonGeneration` and its sections `PROTOCOL_STEP_LESSON_SECTIONS` (`src/main/generation/prompts/protocolStepLesson.ts`), content kind `protocol_step_lesson`. Read lessons in table `protocol_step_encounters`. Streamed over `protocol:startStepLesson` / `protocol:event`, shown by `src/renderer/src/design/protocol/StepLesson.tsx`. See [[Interview Protocol Implementation]].
