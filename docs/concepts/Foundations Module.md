---
title: Foundations Module
tags: [concept, learning-content]
---

# Foundations Module

Prerequisite topics the primer assumes but does not teach: how the web works, networking basics, inside a server, data storage basics, orders of magnitude, failures and redundancy. The list and its rationale: [[Foundations Module Content]]. Generated from the model's own knowledge, so it is ungrounded and flagged as such in the UI, unless a topic is grounded on primer sections the primer does not teach as a topic (`orders-of-magnitude`, on the appendix tables). First stage of the [[Learning Path]].

## Related

- First stage of the [[Learning Path]]
- Ungrounded by default, grounded when its seed declares primer sections, see [[Grounding]]

## In code

- Topic list: `FOUNDATIONS_TOPICS` (`src/main/content/foundations.ts`), seeded first at startup by `seedTopics` (`src/main/content/topics.ts`, `in_foundations_module = 1`).
- Ungrounded prompt variants (no excerpts, no citations, `grounded: false`) for every content prompt, chosen by `topicGrounding` (`src/main/generation/pipelines.ts`) from `topics.in_foundations_module` and the seed's `groundedOn` (`foundationsGroundedOn`): a seed that declares sections gets the grounded variants on exactly those sections, guarded by `UNGROUNDED_RULES` (`src/main/generation/prompts/common.ts`); each topic's `scope` steers its [[Notion Outline]]. See [[Prompts]].
- "Outside the primer" badge: `OutsidePrimerBadge` (`src/renderer/src/lesson/`), shown when `TopicSummary.grounded` is false, on topic lists, lesson, topic screen and quiz results.
- End-to-end test: `src/main/content/foundations.test.ts`. See [[Foundations Module Content]].
