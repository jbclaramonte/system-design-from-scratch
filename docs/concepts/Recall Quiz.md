---
title: Recall Quiz
tags: [concept, assessment]
issue: [70, 71, 72, 73, 74, 75]
---

# Recall Quiz

A short quiz, about 6 questions, on [[Notion]]s of Topics the learner already passed. It comes **before the [[Lesson]] of a new [[Topic]]** (the first time that Lesson opens), or on request from the [[Memory Review]] ("Practice"). Old questions are reused, with a few new ones when a batch is stored, and more weight goes to [[Shaky Notion]]s. Questions are single choice, multiple choice or scenario, all graded locally.

It is always taken and never blocks: whatever the result, the Lesson opens next, and nothing about it changes mastery, [[Weak Point]]s, [[XP]], [[Level]]s, [[Badge]]s, the [[Activity Streak]] or the [[Daily Goal]]. It is skipped silently when there is nothing to recall. It is not a [[Round]] and has no [[Mastery Threshold]], no pass or fail wording, nothing red.

## Related

- Taken in a [[Recall Session]] (kind `gate` before a Lesson, kind `practice` from the [[Memory Review]])
- Answers are [[Attempt]]s of that session, never of a [[Round]]
- Covers passed Topics: mastered by a [[Round]] or a [[Declared Mastery]]; the Topic being opened and the most recently passed Topic are left out (that interval is the spacing)
- New questions come from a [[Pre-generation]] that fills the [[Content Cache]]; the learner never waits for one
- Not a [[Quiz]] played as a Round: the stored quiz behind the new questions has `purpose = 'recall'`

## In code

Pure rules in `src/main/recall/` (`eligibility.ts`, `memory.ts`, `selection.ts`), service `createRecallService` (`service.ts`), channels `recall:*` (`src/main/ipc/recall.ts`), screen `src/renderer/src/recall/` (`RecallGate`, `RecallPlayer`, `RecallResults`), trigger `showsRecallGate` (`recallTrigger.ts`) used by `src/renderer/src/mastery/TopicScreen.tsx`. Rules, tables and IPC: [[Recall Implementation]].
