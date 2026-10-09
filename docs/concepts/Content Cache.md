---
title: Content Cache
tags: [concept, generation]
---

# Content Cache

SQLite store of every generated lesson, remediation lesson and quiz, reused when a topic is redone.

## Related

- Stores output of [[Generation]]s
- Filled ahead of need by [[Pre-generation]]s

## In code

Table `content_cache`, repository `src/main/db/repositories/contentCache.ts` (`contentCacheKey`). See [[Data Model]]. Read and written by `GenerationService` (`src/main/generation/service.ts`): a hit is returned with `fromCache: true`, only successful results are stored, failed and cancelled runs never are. See [[Generation Service]].
