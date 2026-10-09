---
title: Question
tags: [concept, assessment]
---

# Question

One item of a [[Quiz]], tagged with [[Notion]]s. Types: single-choice, multiple-choice, scenario / trade-off, and short free answer. The first three are graded locally; free answers are graded by the LLM through a [[Generation]]. The learner can flag a faulty question; it is then regenerated on the same notions.

## Related

- Belongs to a [[Quiz]]
- Tagged with [[Notion]]s
- Answers are recorded as [[Attempt]]s

## In code

Tables `questions` and `question_notions`, repository `src/main/db/repositories/assessment.ts`. See [[Data Model]].

Generated shape (answer key, explanation, rubric) in `src/main/generation/prompts/quiz.ts`. A faulty question is flagged with `flagQuestion` and replaced by `regenerateQuestion` (`src/main/generation/pipelines.ts`), which keeps the flagged one as history. See [[Prompts]].
