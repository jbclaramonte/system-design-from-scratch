---
title: Weak Point
tags: [concept, assessment]
---

# Weak Point

A [[Notion]] the learner should practice: tested in at least one completed [[Round]], with its latest score below the current [[Mastery Threshold]]. Listed on the [[Dashboard]], most urgent first, with a reason ("Missed in 3 of 3 rounds, including the last one").

## Related

- A [[Notion]] of the [[Notion Map]] that is not mastered
- Built from [[Attempt]]s
- Shown on the [[Dashboard]]

## In code

`WeakPoint` in `src/shared/dashboard.ts`, computed by `buildDashboard` (`src/main/dashboard/model.ts`, `topicWeakPoints`, `compareWeakPoints`, `weakPointReason`). Rule and order: [[Dashboard Implementation#Weak points]].
