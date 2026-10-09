---
title: Grounding
tags: [concept, generation]
---

# Grounding

Generating content from bundled excerpts of the [[Source Corpus]] and citing the source section. Content is either grounded or ungrounded; ungrounded content ([[Foundations Module]], extra generated designs) is flagged in the UI.

## Related

- Uses the [[Source Corpus]]
- Applies to [[Lesson]] and [[Quiz]] generation

## In code

- Excerpt lookup with citations: `findExcerpts` and `fitExcerptsToBudget` in `src/main/corpus/lookup.ts`. See [[Corpus]].
- Prompt rules, citation format `[source: <section id>]` and excerpt assembly within a token budget: `src/main/generation/prompts/common.ts`. Topic and notion excerpts: `topicGrounding` and `notionGrounding` in `src/main/generation/pipelines.ts`. See [[Prompts]].
