---
title: Daily Goal
tags: [concept, assessment]
issue: 64
---

# Daily Goal

How many [[Round]]s the learner aims to complete in a local calendar day: **1 to 3, default 1**, the `dailyGoalRounds` setting (Settings, "Daily Goal" card). The Streak card shows today's progress ("1 / 2 Rounds") with a progress bar, and says "Daily Goal met." when it is reached (the word "Met" is written, not only a color).

- Only completed Rounds count, passed or not; a reviewed [[Protocol Step]] makes an [[Activity Day]] but is not a Round.
- A [[Declared Mastery]] and a [[Forced Unlock]] never count.
- The goal only fills the bar: it does not decide the [[Activity Streak]] (one completed Round or Protocol Step is enough for a day). Changing the setting applies at once, to today too.
- Reaching it triggers nothing: no notification, no sound.

## Related

- [[Activity Streak]], [[Activity Day]], [[Mastery Loop]]

## In code

Setting `daily_goal_rounds` in the key/value `settings` table (no migration: read as 1 until the first save, `unseededDefaults`), `dailyGoalRounds` in `AppSettings` (`src/shared/settings.ts`, `settingsLimits`, `settingsErrors`, zod shape in `src/main/settings/settingsIpc.ts`). Progress: `dailyGoalProgress` in `src/main/activity/activity.ts`. See [[Mastery Loop Implementation#Settings]].
