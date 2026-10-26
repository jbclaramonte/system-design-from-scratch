---
title: Recall Session
tags: [concept, assessment]
issue: [71]
---

# Recall Session

The stored identity of one [[Recall Quiz]]: when it started, which questions it asks (in a fixed order, so an interrupted session resumes as it was), its [[Attempt]]s, and whether it is completed. Its kind is `gate` (taken before the [[Lesson]] of a [[Topic]] opens; it belongs to that Topic) or `practice` (started from the [[Memory Review]]; it belongs to no Topic).

It is not a [[Round]]. An Attempt of a Recall Session has a `recall_session_id` and no `round_id`, so everything that reads Attempts through Rounds (mastery, [[Weak Point]]s, [[XP]], [[Badge]]s, [[Activity Day]]s) never sees it. Only completed sessions feed the answer window of a [[Notion]].

- A `gate` session resumes: reopening the Lesson continues the same session with its answers. Once completed, the Topic is never asked again. An open gate session whose questions are in another [[Generation Language]] is not resumed (a new one is built, or none).
- A `practice` session never resumes: each practice builds a new session. An abandoned open session counts for nothing.

## Related

- Holds the [[Attempt]]s of a [[Recall Quiz]]
- Its completed answers feed the [[Shaky Notion]] rule and the [[Memory Review]]

## In code

Tables `recall_sessions` and `recall_session_questions`, column `attempts.recall_session_id` (migration 11), repository `src/main/db/repositories/recall.ts`, type `RecallSession` in `src/main/db/types.ts`. See [[Data Model#Recall Quiz data]].
