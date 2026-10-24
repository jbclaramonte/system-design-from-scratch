---
title: XP
tags: [concept, assessment]
issue: 65
---

# XP

Experience points: a number that grows only when the learner **masters** something. It is the input of the [[Level]]; it is not a currency and buys nothing.

Pays: a completed [[Round]] (its score divided by 5, plus 10 when passed), the first mastery of a [[Topic]] (+50), a [[Protocol Step]] passed (+15, once per Design Exercise and step), a completed [[Design Exercise]] (+100). Exact rates in [[Rewards Implementation#XP rules]].

Pays nothing: a [[Declared Mastery]], a [[Forced Unlock]], reading a [[Lesson]], asking a [[Lesson Question]], a [[Question Clarification]], re-reading. The same event never pays twice (a Topic's first mastery once, a Round once). XP is derived from the history every time, so activity from before the feature counts at once; the end of a Round says what it paid ("+30 XP: Round passed").

## Related

- [[Level]], [[Badge]], [[Activity Streak]] (a streak is not XP)
- [[Mastery Loop]], [[Mastery Threshold]] (decides "passed")

## In code

`XP_RULES` and `xpReasons` in `src/shared/rewards.ts`; `xpEvents`, `totalXp`, `roundXpAwards` in `src/main/rewards/rewards.ts`; channels `rewards:get` and `rewards:getRound`; `RoundXp` and `LevelCard` in `src/renderer/src/rewards/`.
