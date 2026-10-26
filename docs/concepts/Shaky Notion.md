---
title: Shaky Notion
tags: [concept, assessment]
issue: [70]
---

# Shaky Notion

A [[Notion]] the learner missed at least 3 of its last 6 answers, across [[Round]]s and [[Recall Session]]s (status `needs_attention`). The [[Recall Quiz]] gives its questions more weight and tags them "Often missed" with the plain count ("You missed this notion in 3 of your last 6 quizzes"); the [[Memory Review]] lists them first, under "Needs attention".

A Notion with fewer than 2 answers is not tracked, so it is never shaky. A Notion that is no longer shaky leaves the group as soon as its latest answers say so, with nothing to unlock.

## Related

- Found from [[Attempt]]s of completed [[Round]]s and [[Recall Session]]s
- Not a [[Weak Point]]: a Weak Point is a Notion whose latest Round score is below the [[Mastery Threshold]]
- Drives the background batch of new questions ([[Pre-generation]])

## In code

`classifyNotion`, `RECALL_WINDOW` in `src/main/recall/memory.ts`, status type `NotionRecallStatus` in `src/shared/recall.ts`. Window and thresholds: [[Recall Implementation#Answer window and status]].
