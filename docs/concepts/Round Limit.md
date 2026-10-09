---
title: Round Limit
tags: [concept, assessment]
---

# Round Limit

Maximum number of [[Round]]s (N, adjustable) before the app offers another angle or lets the user skip and come back later. Prevents an endless [[Mastery Loop]].

## Related

- Bounds the [[Mastery Loop]]

## In code

Setting `round_limit` in table `settings` (default 3, 1 to 10 on the Settings screen), repository `src/main/db/repositories/settings.ts`. See [[Data Model]].

Counted as the completed rounds below the threshold since the last passed round (`failedRoundsSinceLastPass`, `src/main/mastery/state.ts`); an abandoned round does not count. When reached, the learner picks another angle (a Remediation Lesson in a style not used yet on the notion, then a new round) or a skip (the topic shows as skipped until the learner comes back). The choice is stored per round in `round_limit_choices` (`src/main/db/repositories/mastery.ts`). See [[Mastery Loop Implementation]].
