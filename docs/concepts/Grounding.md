---
title: Grounding
tags: [concept, generation]
---

# Grounding

Generating content from bundled excerpts of the [[Source Corpus]] and citing the source section. Content is either grounded or ungrounded; ungrounded content ([[Foundations Module]] topics without grounding sections, extra generated designs) is flagged in the UI. A Foundations Module topic may be grounded on primer sections that are not a teachable topic (`orders-of-magnitude` on the appendix).

## Related

- Uses the [[Source Corpus]]
- Applies to [[Lesson]] and [[Quiz]] generation

## In code

- Excerpt lookup with citations: `findExcerpts` and `fitExcerptsToBudget` in `src/main/corpus/lookup.ts`. See [[Corpus]].
- Prompt rules, citation format `[source: <section id>]` and excerpt assembly within a token budget: `src/main/generation/prompts/common.ts`. Topic and notion excerpts: `topicGrounding` and `notionGrounding` in `src/main/generation/pipelines.ts` (Foundations Module: the seed's `groundedOn`, `src/main/content/foundations.ts`). Topic flag for the UI: `TopicSummary.grounded` (`src/shared/topic.ts`). See [[Prompts]].
