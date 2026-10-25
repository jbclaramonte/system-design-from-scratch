---
title: Level
tags: [concept, assessment]
issue: 65
---

# Level

A function of total [[XP]]: the highest named Level whose threshold the XP reaches (Novice at 0, then Apprentice, Builder, Designer, Engineer, Senior Engineer, Staff Engineer, Principal Engineer, Architect). Shown with the progress to the next Level ("11 / 300 XP to Engineer") in the Learning Path side panel and on the [[Dashboard]]. The last Level has no next one. A Level never goes down: XP only grows.

Thresholds live in one table, `LEVELS` in `src/shared/rewards.ts`, documented in [[Rewards Implementation#Levels]].

## Related

- [[XP]], [[Badge]], [[Learning Path]]
- [[Celebration]] (a Badge earned, a Level reached and a passed Round are celebrated once)

## In code

`levelProgress` in `src/main/rewards/rewards.ts`; `LevelCard` in `src/renderer/src/rewards/`.
