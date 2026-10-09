---
title: Attempt
tags: [concept, assessment]
---

# Attempt

One recorded answer to a [[Question]]: date, question, notion, type, result. The full attempt history feeds the [[Dashboard]] and keeps spaced repetition possible without a later migration.

## Related

- Answers a [[Question]]
- Feeds the [[Dashboard]] and [[Notion Map]]

## In code

Tables `attempts` and `attempt_notions`, repository `src/main/db/repositories/assessment.ts` (`recordAttempt`, `listAttemptsByNotion`). See [[Data Model]].

Recorded by the [[Quiz Engine]] on each graded answer (`submitAnswer` in `src/main/quiz/service.ts`): normalized answer `{ selected }`, `result`, `score` (all-or-nothing for multiple choice), notion tags copied from the question. One attempt per question per round.
