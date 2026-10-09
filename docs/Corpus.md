---
title: Corpus
tags: [generation, data, license]
issue: 5
primer-commit: ae9bbd7b02d90b9866215de185217d33f39ab733
---

# Corpus

How the [[Source Corpus]] is built and bundled. It is the input of [[Grounding]].

## What is bundled

`resources/corpus/primer.json`, generated from `donnemartin/system-design-primer` at commit `ae9bbd7b02d90b9866215de185217d33f39ab733` (fetched 2026-10-08):

- **Topics and sub-topics**: the English `README.md` split by heading. Each `##` is a topic, each `###` a sub-topic; deeper headings stay in the body. Ids are slug paths (`cache`, `cache/when-to-update-the-cache`) and only change when the heading text changes. Each section keeps its heading breadcrumb, raw Markdown body, a source reference (GitHub anchor and permalink at the pinned commit), and the referenced image paths.
- **Disadvantage(s)** and **Source(s) and further reading** blocks are stored apart from the body. A `###` block belongs to its topic, a deeper one to its sub-topic.
- **Reference Solutions**: the 8 `solutions/system_design/*/README.md` files, with problem statement, use cases, constraints, steps (`##` sections), full Markdown, referenced diagrams, and the names of the diagram and code files in the upstream folder.
- **Metadata**: pinned commit, fetch date, license name and URL, the primer's own License section, attribution text, modification notice.

Meta sections (Anki flashcards, Contributing, Index of system design topics, Under development, Credits, Contact info, License) are left out of the topics.

> [!warning] Not bundled
> Images, code files, Anki decks, translations, and any third-party page linked from the primer. Links are kept as URLs only.

## Refreshing

```bash
npm run corpus:build                     # pinned commit
node scripts/build-corpus.ts --sha <sha>  # another commit
```

Needs Node 22.18 or later (native TypeScript type stripping). Set `GITHUB_TOKEN` if the GitHub API rate limit is hit. After a bump, update `PINNED_SHA` in `scripts/build-corpus.ts` and the commit in this note, review the artifact diff (ids that disappear break cached references), and run `npm test`.

## License obligations

The primer is CC BY 4.0. Any screen or export that shows primer content must keep:

- attribution (`metadata.attribution`) and a link to the license (`metadata.license.url`),
- the modification notice (`metadata.modifications`),
- the source section of each excerpt (`citation`), when content is grounded.

The About screen shows these (see [[SPEC]] section 4.1 and [[Attribution and Licenses]]).

## In code

- `src/main/corpus/ingest.ts`: pure split of the primer Markdown and of the solutions.
- `src/main/corpus/lookup.ts`: `createCorpus` (`listTopics`, `getTopic`, `getSection`, `listReferenceSolutions`, `getReferenceSolution`, `findExcerpts`), `estimateTokens`, `fitExcerptsToBudget`. Lexical scoring (title, breadcrumb and body term matches weighted by rarity), no embeddings.
- `src/main/corpus/index.ts`: `loadCorpus(corpusPath(app.getAppPath()))`. Main process only, not exposed to the renderer yet.

## Teachable topics

Not every primer section is a [[Topic]]. These seven are neither seeded nor listed (`NON_TEACHABLE_CORPUS_TOPIC_IDS` in `src/main/content/topics.ts`): `motivation`, `study-guide`, `how-to-approach-a-system-design-interview-question`, `system-design-interview-questions-with-solutions`, `object-oriented-design-interview-questions-with-solutions`, `system-design-topics-start-here`, `appendix`. They stay in the [[Source Corpus]]; the interview-method section grounds the [[Protocol Step Lesson]]s instead, with a few `appendix` tables (see [[Interview Protocol Implementation#Generations]]), and the `appendix` intro, powers of two and latency numbers sections ground the [[Foundations Module]] topic `orders-of-magnitude` (its seed's `groundedOn`, see [[Foundations Module Content#Grounded foundations]]). Excerpt lookup (`findExcerpts`) serves any section, teachable or not.
