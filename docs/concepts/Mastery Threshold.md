---
title: Mastery Threshold
tags: [concept, assessment]
---

# Mastery Threshold

Minimum quiz score, in percent, to validate a [[Topic]]. Global setting, 100 by default.

## Related

- Evaluated at the end of each [[Round]]
- Unlocks steps in the [[Learning Path]]

## In code

Setting `mastery_threshold` in table `settings` (whole percent, 50 to 100 on the Settings screen), repository `src/main/db/repositories/settings.ts`. See [[Data Model]].

Applied when a round is completed (`rounds.passed` is stored, so a later change never rewrites history) and to pick the missed notions of a failed round: per-notion score below the threshold (`missedNotions`, `src/main/mastery/state.ts`). See [[Mastery Loop Implementation]].
