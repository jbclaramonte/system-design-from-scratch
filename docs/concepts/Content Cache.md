---
title: Content Cache
tags: [concept, generation]
---

# Content Cache

SQLite store of every generated lesson, remediation lesson and quiz, reused when a topic is redone.

## Related

- Stores output of [[Generation]]s

## In code

Table `content_cache`, repository `src/main/db/repositories/contentCache.ts` (`contentCacheKey`). See [[Data Model]].
