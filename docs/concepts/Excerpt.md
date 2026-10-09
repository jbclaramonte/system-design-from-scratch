---
title: Excerpt
tags: [concept, generation]
---

# Excerpt

A passage of the [[Source Corpus]] returned by the lookup API (`findExcerpts`), together with a citation (section id, breadcrumb, permalink) so the generated content can cite where it comes from. Excerpts are selected by deterministic lexical scoring and trimmed to a token budget before being passed to a [[Generation]]. They are what makes content [[Grounding|grounded]].

## Related

- Drawn from the [[Source Corpus]]
- Input of a [[Generation]]
- Enables [[Grounding]]

## In code

`src/main/corpus/` (lookup and budget helpers). See [[Corpus]]. Formatted for prompts by `assembleExcerpts` (`src/main/generation/prompts/common.ts`), see [[Prompts]].
