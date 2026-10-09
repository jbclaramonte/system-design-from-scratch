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

Prompt `buildRemediationLessonGeneration` (`src/main/generation/prompts/remediationLesson.ts`, angles `concrete_example` and `analogy`), request built by `prepareRemediationLesson` (`src/main/generation/pipelines.ts`), grounded on the notion's own sections. See [[Prompts]].
