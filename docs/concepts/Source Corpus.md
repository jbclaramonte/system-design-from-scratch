---
title: Source Corpus
tags: [concept, generation]
---

# Source Corpus

The bundled system-design-primer (CC BY 4.0), split by Markdown heading. Attribution is shown on the About screen.

## Related

- Basis of [[Grounding]]

## In code

- Artifact: `resources/corpus/primer.json`, built by `scripts/build-corpus.ts`. See [[Corpus]].
- Types: `src/main/corpus/types.ts` (`CorpusTopic`, `CorpusSubTopic`, `CorpusMetadata`).
- Split: `src/main/corpus/ingest.ts`. Loader: `src/main/corpus/index.ts`.
