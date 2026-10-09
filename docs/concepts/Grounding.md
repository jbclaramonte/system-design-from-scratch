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
- Not yet wired into generation.
