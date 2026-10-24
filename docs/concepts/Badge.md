---
title: Badge
tags: [concept, assessment]
issue: 65
---

# Badge

A mark of a milestone of mastery, with a clear unlock rule: First Topic mastered, Foundations complete, Perfect Round (100% on a completed [[Round]]), Comeback (a passed Round after a failed one on the same [[Topic]]), 7-day [[Activity Streak]], First [[Design Exercise]] completed. A Badge unlocks at the time of the event that completed its rule and stays earned (a 7-day streak that later ends keeps its Badge). A [[Declared Mastery]] counts for none of the mastery Badges.

The [[Dashboard]] lists every Badge: earned with its date, locked with its rule and the word "Locked" (neutral, never red). The Badge list lives in one module (`BADGES`), so adding a Badge is a data change; the table of unlocked Badges only remembers which ones were already celebrated, so a celebration plays once.

## Related

- [[XP]], [[Level]], [[Activity Streak]]
- Rules in [[Rewards Implementation#Badges]]

## In code

`BADGES` in `src/shared/rewards.ts`; `badgeUnlocks` in `src/main/rewards/rewards.ts`; table `celebrated_badges` (migration 10, `src/main/db/repositories/badges.ts`); `BadgesSection` in `src/renderer/src/rewards/`.
