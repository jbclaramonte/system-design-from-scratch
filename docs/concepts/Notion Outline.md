---
title: Notion Outline
tags: [concept, learning-content]
---

# Notion Outline

The ordered list of [[Notion]]s a [[Topic]] is split into, each with a slug, a French title, a one-line description and the [[Source Corpus]] sections it comes from. Generated once per topic by a [[Generation]] seeded by the topic's sub-topics (ungrounded in the [[Foundations Module]]), then fixed: question tags and [[Attempt]]s reference its notions, so it is never regenerated silently. It drives the sections of the [[Lesson]] and the notion tags of the [[Quiz]].

## Related

- Splits a [[Topic]] into [[Notion]]s
- Structures the [[Lesson]] and the [[Quiz]]
- Follows [[Grounding]] rules

## In code

Generation kind `notion_outline`, prompt and schema in `src/main/generation/prompts/notionOutline.ts`, run and stored by `ensureNotionOutline` (`src/main/generation/pipelines.ts`) in the `notions` table (`createNotions`). See [[Prompts]] and [[Data Model]].
