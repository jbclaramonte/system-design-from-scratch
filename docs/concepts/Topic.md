---
title: Topic
tags: [concept, learning-content]
---

# Topic

A system design subject taught as one unit, for example Caching or Load Balancing. In the [[Source Corpus]] a topic maps to a `##` heading of the primer. A topic is made of several [[Notion|notions]] and is validated by reaching the [[Mastery Threshold]] on its [[Quiz]].

## Related

- Contains [[Notion]]s
- Taught by a [[Lesson]]
- Assessed by a [[Quiz]]
- Sequenced by the [[Learning Path]]

## In code

Table `topics`, repository `src/main/db/repositories/learningContent.ts`. See [[Data Model]].

Seeded at startup from the [[Source Corpus]] by `seedTopics` (`src/main/content/topics.ts`, slug = corpus topic id, idempotent; [[Foundations Module]] topics via the same hook, none defined yet). Listed over IPC with `topic:list` and `topic:get` (with its [[Notion Outline]] status). See [[Lesson View]].
