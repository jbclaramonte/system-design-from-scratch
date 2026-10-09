---
title: Remediation Lesson
tags: [concept, learning-content]
---

# Remediation Lesson

Short generated lesson about a single missed [[Notion]], written from a different angle than the original [[Lesson]] (concrete example, analogy). Produced between two [[Round|rounds]] of the [[Mastery Loop]].

## Related

- Targets a [[Notion]]
- Part of the [[Mastery Loop]]
- Stored in the [[Content Cache]]

## In code

Table `remediation_lessons`, repository `src/main/db/repositories/learningContent.ts`. See [[Data Model]].

Prompt `buildRemediationLessonGeneration` (`src/main/generation/prompts/remediationLesson.ts`, angles `concrete_example`, `analogy`, `contrast` and `guided_questions`, with the angles already used on the notion), request built by `prepareRemediationLesson` (`src/main/generation/pipelines.ts`), grounded on the notion's own sections. See [[Prompts]].

One per missed notion of a failed [[Round]], each on the next angle not used yet for its notion; generated, streamed and recorded (with the round) by the [[Mastery Loop]] service (`src/main/mastery/`), shown by `RemediationLesson` (`src/renderer/src/mastery/`). See [[Mastery Loop Implementation]].
