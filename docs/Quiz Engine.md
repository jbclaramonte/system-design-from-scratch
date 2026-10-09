---
title: Quiz Engine
tags: [assessment, architecture]
issue: 9
---

# Quiz Engine

Plays a [[Quiz]] as one [[Round]], grades single-choice, multiple-choice and scenario [[Question|questions]] locally (no [[Generation]]), records every answer as an [[Attempt]] tagged with [[Notion|notions]], and scores the round per quiz and per notion against the [[Mastery Threshold]]. The [[Mastery Loop]] around it (remediation, next round, [[Round Limit]]) is #11; free-answer grading is #10.

## Code

| Part | Where |
|---|---|
| Shared types (views without answer keys, feedback, scores) | `src/shared/quiz.ts` |
| Pure grading and scores | `src/main/quiz/grading.ts` |
| Quiz service (rounds, attempts, guards) | `src/main/quiz/service.ts` (`createQuizService`) |
| IPC (`quiz:*` channels, request validation) | `src/main/ipc/quiz.ts` |
| Dev fixture quiz | `src/main/quiz/devFixture.ts` |
| Screens | `src/renderer/src/quiz/` (`QuizScreen`, `QuizPicker`, `QuizPlayer`, `QuizResults`) |
| Repository additions | `nextRoundNumber`, `findOpenRound` in `src/main/db/repositories/assessment.ts` |

## Answer keys stay in the main process

The renderer gets a `QuestionView`: prompt, scenario, choice texts and notions, never the `correct` flags or the explanation. It sends `{ selected: number[] }` (choice indexes); the main process grades and returns a `QuestionFeedback` with the answer key, each choice marked `correct` / `selected`, and the stored explanation.

## Grading rules

An answer is first normalized: duplicate indexes are collapsed and sorted; an index outside the choice list, a non-integer, a malformed answer or an empty selection is refused (`InvalidAnswerError`) and nothing is recorded.

| Type | Result | Score |
|---|---|---|
| `single_choice` | `correct` or `incorrect`; more than one choice is refused | 1 or 0 |
| `scenario` | Same as single choice. The feedback repeats the scenario and labels the explanation as the trade-off justification. | 1 or 0 |
| `multiple_choice` | `correct` when the selection is exactly the set of correct choices; `partially_correct` when at least one correct choice was picked but some are missing or a wrong one was added; `incorrect` otherwise | 1 only when `correct`, else 0 |

> [!note] Why multiple choice is all-or-nothing
> A "select all that apply" question tests whether the learner can tell every right option from every wrong one: a missing or extra pick is a misconception on the notion, and remediation should target it. Partial credit would let a quiz reach a threshold below 100% without that, and would make a notion look half-mastered on the [[Notion Map]]. The score stays 0 or 1, like the other choice types, so scores add up the same way. How close the learner was is still shown: `partialCredit` = (correct picks - wrong picks) / correct choices, floored at 0, is in the feedback (not stored; it can be recomputed from the stored answer).

The Attempt stores the normalized answer, `result`, `score` and `feedback = null` (text feedback is for free answers). Its notion tags are copied from the question by `recordAttempt`.

## Scores

- **Quiz score** = sum of question scores × 100 / number of graded questions (computed in that order, so whole percents stay exact).
- **Per-notion score**: a question tagged with several notions counts fully for each of them. A notion is `missed` when at least one of its questions scored below 1: the remediation targets for #11.
- **Passed** = quiz score ≥ the `mastery_threshold` setting at completion time. `passed` is stored on the round, so a later threshold change does not rewrite history.

## Round lifecycle

1. `quiz:startRound { quizId }`: resumes the open (uncompleted) round of that quiz if there is one, with the feedback of its answered questions; otherwise creates a round with `nextRoundNumber` (highest number of the topic + 1, so numbers never restart, even across quizzes). Atomic.
2. `quiz:submitAnswer { roundId, questionId, answer }`: grades and records one Attempt. Refused when the round is unknown or completed, the question is not in the round's quiz or was replaced (flagged), it is already answered in this round, or its type has no grader.
3. `quiz:completeRound { roundId, answers? }`: optionally submits the given answers, then requires an Attempt for every gradable question in play, computes the score, stores `completed_at`, `score_percent`, `passed`, and returns the `RoundResult` (per-question feedback, per-notion scores, skipped questions). All in one transaction: on refusal, the answers given with it are rolled back. A completed round cannot be graded again.

`quiz:listTopics`, `quiz:listQuizzes` and `quiz:load` feed the picker. `quiz:createDevQuiz` is dev only (refused when packaged).

## Free answers (#10)

`free_answer` questions have no local grader: `QuestionView.gradable` is false, the player shows "coming with free-answer grading" and lets the learner skip, and the round leaves them out of the score (`skippedQuestionIds`). Extension point: `createQuizService(db, graders)` takes a `Graders` map; #10 adds a `free_answer` grader returning the same `GradingResult` (`result`, `score` between 0 and 1, text `feedback`), adds its answer shape to `QuestionAnswer` and a feedback variant to `QuestionFeedback` (`kind`). Since an LLM grader is asynchronous, #10 will also make the submit path async (grade outside the transaction, record inside).

## Player

One question at a time, with feedback right after each answer: a complete beginner gets the explanation while the question is fresh, the focus stays on one idea, and each answer is recorded as soon as it is given (an interrupted round resumes where it stopped). Native radio buttons (single choice, scenario) and checkboxes (multiple choice) in a `fieldset` / `legend`, so the keyboard works without custom handling (arrows / Space to select, Enter to submit); the focus moves to each new question heading and to the Next button after feedback. French content is marked `lang="fr"`, in a column of about 72 characters that wraps freely.

## Dev fixture

`Create fixture quiz (dev)` on the picker creates a quiz with one question of each type on a dedicated topic `dev-quiz-fixture` ("Cache (dev fixture)", position 9999) with three notions. It never adds notions to a real topic: that would stand in for its [[Notion Outline]].
