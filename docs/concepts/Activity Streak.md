---
title: Activity Streak
tags: [concept, assessment]
issue: 64
---

# Activity Streak

The number of consecutive [[Activity Day]]s ending **today, or yesterday while today has no activity yet**. Shown in the "Streak" card of the [[Learning Path]] and of the [[Dashboard]] overview, with the week strip (Monday to Sunday: done days checked, today highlighted, future days locked). No XP, no notification, no sound; a fresh install reads "Start your streak" and nothing is red.

## Rule

Decided in chronological order over the Activity Days (so adding a later day never changes an earlier verdict):

1. Two Activity Days in a row extend the streak.
2. **Grace day**: exactly one missed day between two Activity Days does not break the streak. The missed day is bridged, not counted: the streak counts Activity Days only.
3. A grace day may be used **at most once per 7 days**: two grace days are at least 7 days apart (`GRACE_INTERVAL_DAYS`). A second missed day closer than that breaks the streak. The grace day is spent once used, even if the streak breaks later.
4. Two or more missed days in a row break the streak; the next Activity Day starts a new one at 1.
5. Today: with an Activity Day today or yesterday the streak is alive. With the last Activity Day the day before yesterday it is alive **at risk** when the grace day is free (yesterday was a rest day: the next Activity Day spends the grace day and extends the streak), and 0 otherwise. Older than that, 0.
6. Activity dated after today (a clock set back) is ignored.

The card says when the grace day was used ("Grace day used on Thu 22 Oct.") and the week strip marks that day with a dashed ring and the text "grace day, the streak continues". A learner with history but no live streak sees "Start a new streak".

Examples (A = Activity Day, . = missed day): `A A . A` is a streak of 3 (grace on the third day); `A A . A . A` is 1 when the two gaps are less than 7 days apart (the second miss breaks it); `A . . A` is 1.

## Related

- Counts [[Activity Day]]s; the [[Daily Goal]] is separate and never decides the streak
- Not an input: [[Declared Mastery]], [[Forced Unlock]], opening a [[Lesson]]

## In code

`activityStreak`, `weekStrip`, `buildActivitySummary` in `src/main/activity/activity.ts` (pure, tested in `activity.test.ts`; the clock `now` and the time zone `DayOf` are injected, days are integers so daylight-saving changes cannot create a phantom gap). Types in `src/shared/activity.ts`; channel `activity:get` (`src/main/activity/activityIpc.ts`); UI in `src/renderer/src/activity/` (`ActivityCard`, `activityText.ts`). No table, no migration.
