---
title: Notion
tags: [concept, learning-content]
---

# Notion

A fine-grained idea inside a [[Topic]], for example cache-aside versus write-through. Every [[Question]] is tagged with one or more notions. Notions are the unit of mastery tracking: a missed notion triggers a [[Remediation Lesson]].

## Related

- Belongs to a [[Topic]], listed in its [[Notion Outline]]
- Tags [[Question]]s
- Drives [[Remediation Lesson]]
- Visualized in the [[Notion Map]]

## In code

Table `notions` (with `source_sections`), repository `src/main/db/repositories/learningContent.ts`. Created from the topic's [[Notion Outline]] by `ensureNotionOutline` (`src/main/generation/pipelines.ts`). See [[Data Model]] and [[Prompts]].
