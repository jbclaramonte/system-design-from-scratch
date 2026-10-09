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

Recorded by the [[Quiz Engine]] on each graded answer (`submitAnswer` and `submitFreeAnswer` in `src/main/quiz/service.ts`): normalized answer (`{ selected }` or `{ text }`), `result`, `score` (all-or-nothing for multiple choice and free answers), notion tags copied from the question. One attempt per question per round; nothing is recorded when a free-answer grading fails.

A free-answer attempt stores its grading record as JSON in `feedback` (verdict, expected points covered, explanation, prompt version). A contested grade is re-graded once: the new grading replaces the first (`updateAttemptGrading`), which stays in the record's `history` next to the learner's justification.
