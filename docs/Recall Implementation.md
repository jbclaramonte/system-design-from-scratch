---
title: Recall Implementation
tags: [assessment, architecture, ui]
issue: [70, 71, 72, 73, 74, 75, 76]
---

# Recall Implementation

How the app brings old [[Notion]]s back: the [[Recall Quiz]] before a new [[Lesson]], and the [[Memory Review]] screen of the notions that do not stick. Design: `docs/superpowers/specs/2026-10-25-recall-quiz-design.md`. Built on the [[Mastery Loop Implementation|Mastery Loop]], the [[Quiz Engine]] (local grading, Question Clarification) and [[Pre-generation]]; nothing in the Mastery Loop, the unlock rules, [[Forced Unlock]] or [[Declared Mastery]] changed.

> [!important] Recall never moves mastery
> A Recall Quiz is not a [[Round]]. Its [[Attempt]]s have no `round_id`, so mastery, [[Weak Point]]s, [[XP]], [[Level]]s, [[Badge]]s, the [[Activity Streak]] and the [[Daily Goal]] never see them. `src/main/recall/isolation.test.ts` reads every one of these before and after a completed gate session and an open practice session, and requires them to be equal.

## Rules

### Answer window and status

One **answer** is the final result of one Question in one completed session (a [[Round]] or a [[Recall Session]]), for each Notion the Attempt is tagged with. Replaying a Question inside one Round counts once; the same Question in two sessions counts twice.

| Rule | Value |
|---|---|
| Window | The last 6 answers of a Notion (`RECALL_WINDOW`), oldest first |
| Sessions that count | Completed ones only. An open or abandoned Round or Recall Session never counts; neither does an Attempt on a replaced question |
| Correct | `result = 'correct'` only; `partially_correct` and `incorrect` are missed |
| Never an answer | A Declared Mastery and a Forced Unlock produce no Attempt |

| Status (checked in this order) | Rule | Memory Review group |
|---|---|---|
| untracked | fewer than 2 answers | none |
| `needs_attention` ([[Shaky Notion]]) | missed at least 3 of the last 6 | Needs attention (honey) |
| `solid` | correct on the last 4 answers, or on all of them when fewer than 4 | Solid (sage, collapsed) |
| `steadier` | every other tracked Notion | Getting steadier (sage) |

The three groups are a total rule: a tracked Notion is in exactly one. Code: `classifyNotion` (`src/main/recall/memory.ts`), `loadNotionResults` (`queries.ts`).

### Eligibility

| Rule | Value |
|---|---|
| Passed Topic | A Round with `passed = 1`, or a Declared Mastery. Its passed date is the earliest of its first passing Round's `completed_at` and its `declared_masteries.created_at`; it counts once |
| Eligible for a gate | Passed Topics, minus the most recently passed one (by date, so a path followed out of order works), minus the Topic being opened |
| Eligible for a practice | Every passed Topic, the most recent one included (the learner chose to practice it) |
| Reusable question | Type single choice, multiple choice or scenario (free answers are not reused), not flagged, not replaced, in the current [[Generation Language]] (`quizzes.language`), from a quiz of any `purpose` |

Code: `passedTopics`, `eligibleTopicIds` (`eligibility.ts`), `loadPassedTopics`, `loadRecallCandidates` (`queries.ts`).

### Selection

About 6 questions (`size` 6), at most 3 new ones first (`maxNew` 3, a question never asked), then reused ones, drawn by weighted sampling without replacement (`selectRecallQuestions`, `selection.ts`; the clock and the random source are injected).

| Weight factor | Value |
|---|---|
| Status of the Notion (a question with several Notions takes the highest) | needs attention 4, steadier 2, solid 1, untracked 1 |
| Age | `1 + min(days since the question was last asked / 7, 3)`; a question never asked takes the maximum, so it is not penalized |

Weight = status x age. Solid Notions come back rarely and never disappear. With too few questions the quiz is shorter; with none there is no quiz.

### Question types

| Type | In a Recall Quiz | Graded |
|---|---|---|
| Single choice | yes | locally |
| Multiple choice | yes (`correct` only when the selection is exactly the correct set) | locally |
| Scenario | yes | locally |
| Free answer | no, never reused or generated | n/a |

So a Recall Quiz never calls a Generation to grade, and there is no contest of a grade. The screen is the quiz screen of the [[Quiz Engine]] (same presentation, [[Question Clarification]] and "I don't understand the question", recorded in the session's target) with a "Recall" pill and, on a Notion that needs attention, an honey "Often missed" tag with the plain count ("You missed this notion in 3 of your last 6 quizzes", the shakiest Notion of the question counts).

## When the gate shows

The gate (`kind = 'gate'`) shows on the **first open of a Topic's Lesson**. `showsRecallGate` (`src/renderer/src/recall/recallTrigger.ts`) is true when the Topic screen is on its initial `lesson` step, the Lesson was not generated yet (`lessonReady` false), no Round exists, and the gate is not over for this visit. So:

- a Lesson generated before the feature gets no gate; reopening a Lesson never asks again;
- a [[Remediation Lesson]] (step `remediation`) and a [[Protocol Step Lesson]] (never on the Topic screen) never get one;
- a Topic opened by a [[Forced Unlock]] or by "Test me" on a declared Topic, with no Lesson yet, gets the gate like any other;
- the Lesson is generated only after the gate, so leaving mid-quiz keeps `lessonReady` false and the open session resumes.

The main process decides whether there is anything to recall (`prepareGate(topicId)`, in this order): a completed gate of that Topic returns nothing; an open gate session whose questions are all in the current Generation Language is resumed with its answers (the newest such session); otherwise a new session is built from the eligible Topics; with no eligible Topic or no question the answer is `null`. An open gate session in another Generation Language is not resumed (a fresh one is built, or none); the stale one stays open and never counts.

**Skipped silently** when there is no eligible Topic or no question. A technical failure (a malformed request, the database) is logged and returns `null` as well, and a failure inside the quiz offers a way out: the Lesson opens. A Recall Quiz never traps the learner and never waits for a Generation.

**Practice** (`startPractice({ notionIds? })`, from the [[Memory Review]]) is not a gate: it can be left at any time, but it does **not resume**. Each practice builds a fresh session, and abandoned open sessions never count (only completed sessions feed the answer window). It uses stored questions only, never waits for a Generation, and an empty result (`null`, or an empty `notionIds`) shows "Nothing to practice yet".

## Generation triggers

New questions are **Pre-generations** (`GenerationService.pregenerate`, priority `background`, cancellable, never awaited by the learner, never an error shown), stored as `recall` quizzes. They reuse the existing quiz pipeline (`prepareQuiz`, `saveQuiz` with `purpose = 'recall'`): no new prompt and no new [[Content Cache]] kind, the prompt version stays `quiz-7`, and the request of the first Round's quiz is unchanged (so is its cache key).

| Trigger | What it generates |
|---|---|
| A Lesson stream that reaches `done` (`triggerRecallBatches`, `src/main/content/lessonIpc.ts`, right after the first-Round quiz Pre-generation) | at most one batch of **new questions** (3, single choice, multiple choice and scenario, one of each) on the eligible Topic with the most Notions that need attention, then the most steadier ones (ties: the Topic passed earliest). Focus: up to 3 Notions, attention first. `avoidPrompts`: every prompt already answered on those Notions, in the Generation Language |
| The same Lesson stream | at most one **declared Topic** (an eligible Topic with a Declared Mastery, no recall quiz in the language and no answered question): its Notion Outline when missing, then its batch. The outline is the one its Lesson will use later |

So at most two Generations per opened Lesson. A declared Topic is planned again after a failed batch (an outline stored but no recall quiz yet) and after a language switch. A batch served again from the Content Cache with the same key stores nothing twice. A batch waits in storage until a Recall Quiz uses it; it serves a later Lesson, not the one that follows immediately. Code: `planRecallBatch`, `planDeclaredBatch`, `generateRecallBatches` (`src/main/recall/batch.ts`).

## Memory Review

`getMemoryReview` builds the groups from the same answer window as the Recall Quiz, over **every completed Round and Recall Session**, so it lists the Notions of Topics not passed yet too. Rows are sorted by misses (most first), then Notion id. Untracked Notions are in no group. A row has the last 6 results (`Correct` or `Missed` as an icon and a word), "Missed 3 of last 6", "Last seen" (the latest answer on the Notion, "today", "yesterday" or "N days ago"), "Open the lesson section" (it opens the Topic: the Topic screen has no section anchor yet) and "Practice".

- "Start a Recall Quiz on these" practices the Notions that need attention; it is disabled (`aria-disabled`, with a note) when none does.
- Practice draws only from passed Topics, so a Notion of a Topic not passed yet answers "Nothing to practice yet".
- Footnote: "Based on the latest 6 answers per notion. Declared Mastery and Forced Unlock never count."
- A load failure shows a calm honey notice with "Try again"; the raw error stays in the console. Opening a Topic from the Memory Review returns to it.

## IPC

Request schemas are zod `.strict()` (`src/main/ipc/recall.ts`). No channel is guarded by the Learning Path lock or notifies `path:changed`: Recall changes no mastery. Answer keys never leave the main process before an answer (`RecallQuestionView` has no `correct` flag).

| `window.api` | Channel | Notes |
|---|---|---|
| `prepareRecallGate({ topicId })` | `recall:prepareGate` | `RecallStart` or `null`; any error is logged and returns `null` |
| `startRecallPractice({ notionIds? })` | `recall:startPractice` | `RecallStart` or `null` |
| `submitRecallAnswer({ sessionId, questionId, answer })` | `recall:submitAnswer` | grades locally, records one Attempt of the session; a second answer, a question outside the session, a completed session and a free answer are refused |
| `completeRecall({ sessionId })` | `recall:complete` | `RecallResult` (feedback and per-Notion outcomes); idempotent on a completed session; refused while a question is unanswered |
| `clarifyRecallQuestion({ sessionId, questionId, another? })` | `recall:clarifyQuestion` | [[Question Clarification]] of an unanswered question; a Generation failure is a `failed` outcome |
| `cancelRecallClarification({ sessionId, questionId })` | `recall:cancelClarification` | aborts the one in progress (also aborted when the window is destroyed) |
| `getMemoryReview()` | `recall:getMemoryReview` | `MemoryReviewView` |

## Data

Migration 11 `recall-sessions` ([[Data Model#Recall Quiz data]]): `quizzes.purpose` (`round` by default, or `recall`), tables `recall_sessions` and `recall_session_questions`, column `attempts.recall_session_id`. Repository `src/main/db/repositories/recall.ts`; the Round-based lookups filter `purpose = 'round'`, so a Topic with a recall quiz still shows one Round quiz and `startRound` refuses a recall quiz. Types in `src/shared/recall.ts` (shared with the renderer) and `src/main/db/types.ts`.

## Screens

`src/renderer/src/recall/`: `RecallGate` (calls `prepareRecallGate` once; `null`, a rejection or a load error continues to the Lesson at once), `RecallPlayer` (no skip and no close; "Previous" re-reads an answered question's feedback; the last button is "See results"), `RecallResults` ("Continue to the Lesson" first, "By notion" with a glyph, a word and `n/m`, then the answers; no pass or fail wording, no XP, no Mastery Threshold bar), `MemoryReviewScreen`. Look: [[Design System#Recall patterns]].

## Verification

- Tests: `src/main/recall/` (`memory`, `eligibility`, `selection`, `queries`, `batch`, `service`, `isolation`), `src/main/db/migration11.test.ts`, `src/main/ipc/recall.test.ts`, `src/renderer/src/recall/` (text, trigger, SSR renders of the screens), `src/renderer/src/shell/navigation.test.ts`. The CLI is a fake runner in every test; no test touches the real data folder.
- `smoke:packaged` ([[Packaging#Smoke test]]): on a fresh install the Dashboard link opens an empty Memory Review; on a seeded history of three passed Topics the Memory Review counts 3 tracked and 1 that needs attention, the Recall Quiz shows six stored questions before the fourth Lesson without a Generation call, the Often missed tag shows, the results carry no verdict, "Continue to the Lesson" generates the Lesson, the Topic is not asked again, the Level's XP did not move, and the Recall answers clear the Notion that needed attention.

## Related

- [[Recall Quiz]], [[Memory Review]], [[Shaky Notion]], [[Recall Session]], [[Pre-generation]], [[Content Cache]], [[Weak Point]], [[Mastery Loop]], [[Declared Mastery]], [[Forced Unlock]]
- [[Mastery Loop Implementation]], [[Dashboard Implementation]], [[Quiz Engine]], [[Generation Service]], [[Data Model]], [[Design System]]
