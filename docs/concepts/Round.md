---
title: Round
tags: [concept, assessment]
---

# Round

One iteration of the [[Mastery Loop]]: play a [[Quiz]], grade it, and if the [[Mastery Threshold]] is not met, move to remediation. Counted against the [[Round Limit]].

## Related

- Part of the [[Mastery Loop]]
- Counted by [[Round Limit]]

## In code

Table `rounds`, repository `src/main/db/repositories/assessment.ts` (`createRound`, `nextRoundNumber`, `findOpenRound`, `completeRound`). See [[Data Model]].

Started, resumed and completed by the [[Quiz Engine]] (`startRound`, `completeRound` in `src/main/quiz/service.ts`): numbers are unique per topic and never restart; completion stores the score and `passed` against the [[Mastery Threshold]]. An open round is resumed by the [[Mastery Loop]] and never counts toward the [[Round Limit]]; the loop between rounds is in `src/main/mastery/`, see [[Mastery Loop Implementation]].
