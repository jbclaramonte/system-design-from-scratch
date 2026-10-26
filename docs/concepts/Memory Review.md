---
title: Memory Review
tags: [concept, assessment]
issue: [75]
---

# Memory Review

The screen of [[Notion]]s the learner finds hard to retain, reached from the [[Dashboard]]. It is computed from the results of every completed [[Round]] and [[Recall Session]]: a header strip (Notions tracked, Need attention, Getting steadier), then the groups Needs attention, Getting steadier and Solid (collapsed). Each row shows the Notion, its [[Topic]], its last results as marks (an icon and a word, never color alone), "Missed 3 of last 6", "Last seen 5 days ago", "Open the lesson section" and "Practice". "Start a Recall Quiz on these" practices the Notions that need attention.

It is not the [[Dashboard]]'s [[Weak Point]] list: a Weak Point is about the latest score of a completed Round, the Memory Review is about the latest 6 answers, Rounds and Recall Sessions together. It lists the Notions of any completed Round, including Topics not passed yet, while a practice draws only from passed Topics: on such a Notion it says "Nothing to practice yet".

Calm tone: honey for attention, sage for the rest, never red, nothing about a lost streak, no XP.

## Related

- Lists [[Shaky Notion]]s first (the Needs attention group)
- "Practice" starts a [[Recall Quiz]] (a [[Recall Session]] of kind `practice`)
- Opened from the [[Dashboard]]; a Topic opened from it returns to it

## In code

`getMemoryReview` of `createRecallService` (`src/main/recall/service.ts`), channel `recall:getMemoryReview`, types `MemoryReviewView` in `src/shared/recall.ts`, screen `MemoryReviewScreen` in `src/renderer/src/recall/`, link in `src/renderer/src/dashboard/DashboardScreen.tsx`. Rules: [[Recall Implementation#Memory Review]].
