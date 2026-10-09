---
title: Lesson
tags: [concept, learning-content]
---

# Lesson

Generated text course on a [[Topic]], streamed to the user. Grounded on the [[Source Corpus]] (except in the [[Foundations Module]]) and stored in the [[Content Cache]].

## Related

- Teaches a [[Topic]]
- Created by a [[Generation]]
- Follows [[Grounding]] rules

## In code

Table `lessons`, repository `src/main/db/repositories/learningContent.ts`. See [[Data Model]].

Prompt `buildLessonGeneration` (`src/main/generation/prompts/lesson.ts`), request built by `prepareLesson` (`src/main/generation/pipelines.ts`): one section per notion of the [[Notion Outline]], inline `[source: <section id>]` citations, a recap per notion. See [[Prompts]].

Streamed to the renderer by `createLessonIpc` (`src/main/content/lessonIpc.ts`, channels `lesson:start`, `lesson:cancel`, `lesson:event`), which records the `lessons` row and starts the quiz [[Pre-generation]]; rendered by `src/renderer/src/lesson/` (source chips, ungrounded badge). See [[Lesson View]].
