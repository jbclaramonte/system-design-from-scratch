---
title: Mastery Loop
tags: [concept, assessment]
---

# Mastery Loop

Lesson, quiz, remediation lessons on missed notions, new quiz with fresh questions plus a reminder of acquired notions, repeated until the [[Mastery Threshold]] is reached.

## Related

- Repeats [[Round]]s
- Uses [[Remediation Lesson]]
- Bounded by [[Round Limit]]

## In code

`src/main/mastery/`: pure state machine `deriveMastery` (`state.ts`, the step is derived from the database, so the loop survives restarts), `createMasteryService` and `mastery:*` IPC (`service.ts`, `masteryIpc.ts`), round quiz options with `focusNotions`, `reminderNotions` and `avoidPrompts` (`quizOptions.ts`), `getTopicMastery` and `latestNotionScores` (`queries.ts`). Topic screen in `src/renderer/src/mastery/`. See [[Mastery Loop Implementation]].
