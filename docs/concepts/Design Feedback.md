---
title: Design Feedback
tags: [concept, design-practice]
---

# Design Feedback

The LLM's assessment of the user's design: gaps, errors and forgotten trade-offs. Given per [[Protocol Step]] when the step is submitted, and once more as a final review comparing the design with the [[Reference Solution]]. Produced by a [[Generation]] from the exported [[Design Scene]].

## Related

- Attached to a [[Protocol Step]] of a [[Design Exercise]]
- Based on the [[Design Scene]], read through its [[Design Export]] ([[Design Graph]], text description, PNG)
- Final review compares with the [[Reference Solution]]
- Complemented by [[Hint]]s, which are requested by the user before submitting

## In code

Table `design_feedback` (`step_feedback`, `hint`, `final_review`), linked from `protocol_step_submissions.design_feedback_id`, see [[Data Model]]. Prompts and schemas `buildStepFeedbackGeneration` / `stepFeedbackSchema` and `buildFinalReviewGeneration` / `finalReviewSchema` (`src/main/generation/prompts/designFeedback.ts`, kind `design_feedback`, never cached); graph steps send the PNG of the [[Design Export]] as an image. Run by `createProtocolService` (`src/main/protocol/service.ts`), shown by `src/renderer/src/design/protocol/FeedbackViews.tsx`. See [[Interview Protocol Implementation]].
