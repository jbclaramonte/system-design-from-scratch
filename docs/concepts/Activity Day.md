---
title: Activity Day
tags: [concept, assessment]
issue: 64
---

# Activity Day

A calendar day, in the learner's **local time** (the day changes at local midnight, so a day can last 23 or 25 hours when the clock changes), with at least one of:

- a completed [[Round]] (graded, passed or not);
- a reviewed [[Protocol Step]] (a submission whose [[Design Feedback]] came back, `status = 'reviewed'`, dated by the time it was reviewed).

These do **not** make an Activity Day: opening a [[Lesson]], a [[Declared Mastery]], a [[Forced Unlock]], a Round left open, a failed or pending Protocol Step submission, a [[Lesson Question]], a [[Question Clarification]].

Activity Days are derived from the history of Rounds and Protocol Steps every time, never stored, so activity from before the feature counts at once. Many Rounds in one day are one Activity Day (the [[Daily Goal]] counts them).

## Related

- Input of the [[Activity Streak]]; the week strip of the [[Dashboard]] and the [[Learning Path]] checks the Activity Days of the current week
- Why a Declared Mastery and a Forced Unlock add nothing: they are not an effort, see [[Declared Mastery]] and [[Forced Unlock]]

## In code

`activityDays` in `src/main/activity/activity.ts` (pure: timestamps and the injected `DayOf`), fed by `listRoundCompletionTimes` (`rounds.completed_at`) and `listReviewedSubmissionTimes` (`protocol_step_submissions.updated_at` of reviewed rows). See [[Dashboard Implementation#Activity]] and [[Learning Path Implementation#Activity card]].
