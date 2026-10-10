---
title: Quiz Engine
tags: [assessment, architecture]
issue: [9, 10, 24]
---

# Quiz Engine

Plays a [[Quiz]] as one [[Round]], grades single-choice, multiple-choice and scenario [[Question|questions]] locally (no [[Generation]]) and free answers through a Generation (#10), records every answer as an [[Attempt]] tagged with [[Notion|notions]], and scores the round per quiz and per notion against the [[Mastery Threshold]]. The [[Mastery Loop]] around it (remediation, next round, [[Round Limit]]) is #11.

## Code

| Part | Where |
|---|---|
| Shared types (views without answer keys, feedback, scores) | `src/shared/quiz.ts` |
| Pure grading and scores (and the free-answer pieces that need no Generation) | `src/main/quiz/grading.ts` |
| Free-answer grader (Generation Service adapter) | `src/main/quiz/freeAnswerGrader.ts` (`createFreeAnswerGrader`) |
| Free-answer grading prompt and schema | `src/main/generation/prompts/freeAnswerGrading.ts`, see [[Prompts#Free-answer grading]] |
| Quiz service (rounds, attempts, guards) | `src/main/quiz/service.ts` (`createQuizService`) |
| IPC (`quiz:*` channels, request validation, grading cancellation) | `src/main/ipc/quiz.ts` |
| Dev fixture quiz | `src/main/quiz/devFixture.ts` |
| Screens | `src/renderer/src/quiz/` (`QuizScreen`, `QuizPicker`, `QuizPlayer`, `QuestionDiagram`, `FreeAnswerForm`, `ContestForm`, `GradingStatus`, `QuestionFeedbackView`, `QuizResults`), styles in `quiz.css`, choice states in `choiceMark.ts` |
| Repository additions | `nextRoundNumber`, `findOpenRound`, `updateAttemptGrading` in `src/main/db/repositories/assessment.ts` |

## Answer keys stay in the main process

The renderer gets a `QuestionView`: prompt, scenario, [[Diagram]] source (`diagram`, or null), choice texts and notions, never the `correct` flags, the explanation, the expected points or the model answer. It sends `{ selected: number[] }` (choice indexes) or `{ text }` (free answer); the main process grades and returns a `QuestionFeedback` (`kind: 'choice'` with the answer key, each choice marked `correct` / `selected`, and the stored explanation; or `kind: 'free_answer'`, see below).

## Grading rules

An answer is first normalized: duplicate indexes are collapsed and sorted; an index outside the choice list, a non-integer, a malformed answer or an empty selection is refused (`InvalidAnswerError`) and nothing is recorded.

| Type | Result | Score |
|---|---|---|
| `single_choice` | `correct` or `incorrect`; more than one choice is refused | 1 or 0 |
| `scenario` | Same as single choice. The feedback repeats the scenario and labels the explanation as the trade-off justification. | 1 or 0 |
| `multiple_choice` | `correct` when the selection is exactly the set of correct choices; `partially_correct` when at least one correct choice was picked but some are missing or a wrong one was added; `incorrect` otherwise | 1 only when `correct`, else 0 |
| `free_answer` | The verdict of the grading Generation: `correct` when every expected point is covered and there is no misconception; `partially_correct` when at least one expected point is covered; `incorrect` otherwise (empty, off-topic or wrong answers included) | 1 only when `correct`, else 0 |

> [!note] Why multiple choice is all-or-nothing
> A "select all that apply" question tests whether the learner can tell every right option from every wrong one: a missing or extra pick is a misconception on the notion, and remediation should target it. Partial credit would let a quiz reach a threshold below 100% without that, and would make a notion look half-mastered on the [[Notion Map]]. The score stays 0 or 1, like the other choice types, so scores add up the same way. `partialCredit` = (correct picks - wrong picks) / correct choices, floored at 0, is still in the feedback (not stored; it can be recomputed from the stored answer), but the UI does not show it as a percentage: "67% of the way" read as a partial score.

Free answers are mapped like multiple choice for the same reason: a `partially_correct` free answer scores 0, so its notions are `missed` and go to remediation. `partialCredit` = covered expected points / expected points is in the feedback.

### Feedback wording

The verdict line says what happened and why a near miss still counts as missed (#26). `partially_correct` stays the stored value; the learner reads "Not quite". Pure helpers in `src/renderer/src/quiz/feedbackText.ts` (tested in `feedbackText.test.ts`), used by `QuestionFeedbackView`, so by the quiz player feedback and the results answers list; the Dashboard attempt history uses the same labels:

- `choiceTally(choices)` counts the correct picks, the correct choices and the wrong picks; `choiceFeedbackMessage(tally)` builds the line. Single choice and scenario: "Correct" or "Incorrect", the choices marked below. Multiple choice:
  - correct picks missing: "Not quite: you found 2 of the 3 correct answers. You need all of them, and none of the wrong ones, to validate this question."
  - wrong picks only: "Not quite: you found all 3 correct answers but also picked 1 wrong answer. You need all of them, ..."
  - both: "Not quite: you found 1 of the 3 correct answers and picked 2 wrong answers. You need all of them, ..."
  - fully wrong: "Incorrect: you found none of the 3 correct answers and picked 2 wrong answers. The correct ones are marked below."
  - fully right: "Correct: you found all 3 correct answers."
- `freeAnswerFeedbackMessage(result, covered, expected)`: "Not quite: you covered 2 of the 3 expected points. You need every expected point, without a major error, to validate this question."; "Correct" or "Incorrect" otherwise.

No percentage or "of the way" phrasing in the feedback.

The Attempt stores the normalized answer, `result`, `score` and `feedback = null` for a choice question. Its notion tags are copied from the question by `recordAttempt`.

## Scores

- **Quiz score** = sum of question scores × 100 / number of graded questions (computed in that order, so whole percents stay exact).
- **Per-notion score**: a question tagged with several notions counts fully for each of them. A notion is `missed` when at least one of its questions scored below 1: the remediation targets for #11.
- **Passed** = quiz score ≥ the `mastery_threshold` setting at completion time. `passed` is stored on the round, so a later threshold change does not rewrite history.

## Round lifecycle

1. `quiz:startRound { quizId }`: resumes the open (uncompleted) round of that quiz if there is one, with the feedback of its answered questions; otherwise creates a round with `nextRoundNumber` (highest number of the topic + 1, so numbers never restart, even across quizzes). Atomic.
2. `quiz:submitAnswer { roundId, questionId, answer }`: grades and records one Attempt. Refused when the round is unknown or completed, the question is not in the round's quiz or was replaced (flagged), it is already answered in this round, or its type has no grader.
3. `quiz:completeRound { roundId, answers? }`: optionally submits the given answers, then requires an Attempt for every gradable question in play, computes the score, stores `completed_at`, `score_percent`, `passed`, and returns the `RoundResult` (per-question feedback, per-notion scores, skipped questions). All in one transaction: on refusal, the answers given with it are rolled back. A completed round cannot be graded again.

`quiz:listTopics`, `quiz:listQuizzes` and `quiz:load` feed the picker. `quiz:createDevQuiz` is dev only (refused when packaged). `quiz:flagQuestion { questionId, reason }` flags a question in play as faulty (`flagQuestion`, reason trimmed, at most 500 characters, unknown or replaced questions refused); it stays playable in the round (see [[#Quiz Diagrams (#24)]]).

## Free answers (#10)

A free answer is graded by a [[Generation]] of kind `free_answer_grading` ([[Generation Service]], never in the [[Content Cache]]): see [[Prompts#Free-answer grading]] for the prompt. The local graders stay synchronous; free answers take their own asynchronous path.

1. `quiz:submitFreeAnswer { roundId, questionId, answer: { text } }`. Refused (thrown, nothing recorded, no Generation) like a choice answer: unknown or completed round, question not in play or not a free answer, already answered in the round, or a grading of the same question already running (double submission). The text is trimmed; empty or longer than `FREE_ANSWER_MAX_LENGTH` (1200 characters) is refused (`InvalidAnswerError`).
2. The grading Generation runs **outside** any transaction, with the question's prompt, expected points, model answer and notions, and the learner's text as untrusted data.
3. Once graded, one transaction checks the round again (still open, question still unanswered) and records the Attempt: `answer = { text }`, `result` = the verdict, `score`, and `feedback` = the grading record as JSON (`FreeAnswerGradingRecord`: `promptVersion`, `grading` with the verdict, each expected point `covered` with a one-line justification, misconceptions, explanation, what to review; `contest`; `history`).
4. The response is an outcome: `{ status: 'graded', feedback }` or `{ status: 'failed', error: { code, message } }`. A failed Generation (`cli_not_found`, `not_logged_in`, `quota_or_rate_limit`, `timeout`, `invalid_output`, `cancelled`...) is not thrown, so the renderer keeps its typed code; **nothing is recorded** and the learner can retry or answer later.

`quiz:cancelGrading { roundId, questionId }` aborts the running grading (the CLI process is killed); closing the window does the same. `completeRound` is refused while a grading of the round is running, and it no longer accepts free answers in `answers` (they must be graded one at a time). `QuestionView.gradable` is true for free answers when the service has a free-answer grader (always in the app); without one (some tests), they are skipped and left out of the score as in #9.

The free-answer feedback (`FreeAnswerQuestionFeedback`) carries the verdict, the learner's answer, each expected point with `covered` and its justification, misconceptions, the explanation, what to review, and the **model answer, revealed only with the grading**.

### Contested grades

A learner who thinks the grade is wrong can contest it **once per question**, while the round is open, unless the verdict is already `correct`: `quiz:contestGrade { roundId, questionId, justification }` (at most 500 characters).

- The answer is re-graded by a new Generation that gets the first grading and the justification. The justification is untrusted text like the answer, and only counts when it points at something the answer already says or at a mistake of the first grading: new content written in it earns nothing, so contesting cannot be used to answer again.
- The second verdict **replaces** the first on the Attempt (`result`, `score`, `feedback`, via `updateAttemptGrading`); the first grading is kept in the record's `history` and the justification in `contest`, and both are shown in the feedback (`contest.previous`). A failed or cancelled re-grade changes nothing.
- There is no manual override. Why: the [[Mastery Threshold]] defaults to 100% and the score drives remediation, so a button that marks any answer correct would let a learner skip the [[Mastery Loop]] on exactly the notions they have not understood. One re-grade by an independent examiner fixes the honest grader mistake (a point stated in other words, a too-strict reading) at the cost of one cheap Generation, and the history keeps the decision transparent. A completed round cannot be contested: its score is stored and drives the next round.

## Player

One question at a time, with feedback right after each answer: a complete beginner gets the explanation while the question is fresh, the focus stays on one idea, and each answer is recorded as soon as it is given (an interrupted round resumes where it stopped). Native radio buttons (single choice, scenario) and checkboxes (multiple choice) in a `fieldset` / `legend`, so the keyboard works without custom handling (arrows / Space to select, Enter to submit); the focus moves to each new question heading and to the Next button after feedback. French content is marked `lang="fr"` and wraps freely in the reading column (see [[#Visual design (#33)]]).

Free answers (`FreeAnswerForm`): a labelled text area limited to 1200 characters with a counter; Ctrl+Enter (⌘+Enter) sends, Enter adds a line. While grading, the text is read-only and a status line offers Cancel. A failure shows the actionable message of its code and keeps the text: Retry, or Answer later (the question is set aside, its draft kept; the end screen lists the questions left and brings them back, since every question counts). After grading: the verdict, the answer, each expected point covered or missing, misconceptions, explanation, what to review, the model answer, and Contest this grade (`ContestForm`: a short justification, same pending / cancel / error states).

### Visual design (#33)

The quiz screens follow `DESIGN.md` ([[Design System]]): dark only, hairline-bordered cards, mono caps labels, status chips, tokens and shared classes only. Styles are in `src/renderer/src/quiz/quiz.css`. The player, the feedback and the results share one reading column of 48rem, centered, so they sit the same way inside the topic screen and the dev Quiz screen.

- **Round progress**: a mono caps line "Round N · topic" with "Question x of N" on the right, over the shared `.progress` bar (answered questions out of all, indigo to emerald, emerald and complete once every question is answered). The bar is a `progressbar` with `aria-valuenow`. The end screen reads "x of N answered".
- **Question**: a type chip (Single choice, Multiple choice with the hint "Select every correct answer.", Scenario, Free answer) that carries the focus when a question appears, the scenario in a card, then the [[Diagram]] (`QuestionDiagram` adds no frame of its own: the diagram component owns its surface), then the prompt in `headline-sm`.
- **Choices**: selectable cards around the native radio or checkbox (so the keyboard and screen reader behavior of the `fieldset` is unchanged). A picked choice gets the indigo (in progress) border, fill and glow through `:has(input:checked)`; the keyboard focus adds the indigo ring on the card.
- **Answered states** (`choiceMark.ts`, tested): every state has a glyph and a chip, never color alone. *Correct* (picked, in the answer key, emerald), *Wrong* (picked, not in the key, red), *Missed* (a correct choice of a multiple choice left out, amber), *Correct answer* (the right choice of a single choice or scenario when another was picked, emerald dashed). A picked choice also carries a neutral "Your answer" chip.
- **Verdict**: a chip with a glowing dot, Correct (emerald), Not quite (amber), Incorrect (red), then the plain-words detail of `feedbackText.ts`. The explanation, Misconceptions, To review and Model answer are cards with a caps label; the expected points of a free answer are rows marked Covered (emerald) or Missing (amber). Contest this grade opens a card with the justification field and the same pending, cancel and error states.
- **Results**: the Round number with a Passed (emerald) or Not passed yet (amber) chip; a score card with the score and the [[Mastery Threshold]] side by side, over the progress bar with a tick at the threshold; the notion table with a Missed or All correct chip per row; then the numbered answers, each with its type chip, the prompt and the same feedback view as the player.
- **Picker** (dev screen): one card per quiz with its question count, a grounded or ungrounded chip, the date and a primary Start button.

## Dev fixture

`Create fixture quiz (dev)` on the picker creates a quiz with one question of each type on a dedicated topic `dev-quiz-fixture` ("Cache (dev fixture)", position 9999) with three notions. It never adds notions to a real topic: that would stand in for its [[Notion Outline]]. The scenario question carries a valid Diagram; the single-choice one carries a Diagram that passes `checkDiagramSource` but that mermaid cannot parse (`[Cache (Redis)]`), to see the fallback and the flag offer.

## Quiz Diagrams (#24)

A choice question (`scenario`, and optionally `single_choice` / `multiple_choice`, never `free_answer`) may carry a `diagram`: a Mermaid source without fences, stored in `questions.body` (no migration) and sent in `QuestionView.diagram`. The prompt rules are in [[Prompts#Quiz]].

- **Validation** (`quizSchema`, `quizDiagramError` in `src/main/generation/prompts/quiz.ts`): the app's `checkDiagramSource` (size, statements, forbidden content, supported type, see [[Mermaid Diagrams#Limits and refused sources]]), at most `QUIZ_DIAGRAM_MAX_NODES` = 10 nodes (the prompt asks for 8), and `diagramAnswerLeak`.
- **Answer leak check** (`diagramAnswerLeak`), deliberately simple: the whole source (node and arrow labels, ids, title), lower-cased, accents and punctuation removed, must not contain the text of a correct choice as whole words, nor "correct", "correcte", "right answer", "bonne réponse", "réponse correcte". It catches a copied answer, not a paraphrase, a highlighted component or a layout that gives the answer away: those are left to the prompt and to the learner's flag. A refused output goes back to the model through the automatic retry ("Fix the diagram; drop it only if it cannot be fixed").
- **No answer key before submission**: the Diagram is part of the question, checked never to contain a correct choice; `loadQuiz` still sends no `correct` flag, explanation or rubric (tested on a question with a Diagram in `service.test.ts`).
- **Player**: `QuestionDiagram` draws it with the shared `MermaidDiagram` (title = the question prompt, so the accessible name is "Diagram: <prompt>"; the source is the text alternative in **Diagram source**), between the scenario and the prompt, before and after answering (it sits outside the answer form).
- **Invalid Diagram**: the standard fallback (note and source as code). `onDiagramError` shows an offer under it: "You can still answer this question", a Reason field pre-filled with `diagram could not be drawn (<code>: <message>)`, and **Flag this question** (`quiz:flagQuestion`). The question stays playable and counts in the round. The flagged question can then be replaced by `regenerateQuestion` (its reason goes into the `replaces` part of the prompt, and the replacement may carry a Diagram), which still has no UI.
- **Verification (2026-10-10)**: unit tests (schema, prompt, body storage and regeneration, view payload, IPC flag, server-side rendering of the player and the flag offer). Built app (dev screens enabled through a scratch electron-vite config, no source change), scratch `--user-data-dir`, no CLI, driven over the Chrome DevTools protocol on the dev fixture quiz, 12 checks passed: Q1 falls back with "Parse error on line 2: ...", shows the source, offers the pre-filled flag, stays answerable, the flag is stored (`flag_reason` read back from the scratch database), the fallback stays after answering; Q2 has no Diagram; Q3 is drawn (`role="img"`, "Diagram: Quelle stratégie de cache convient le mieux ?", Diagram source details), without the flag offer, no answer key on screen before answering, still drawn after answering. Screenshots looked right. One console warning, the expected `[diagram] parse_error`.

### Quiz Diagrams quality review

Sample and full table: [[samples/quiz-diagrams|Sample quiz with Diagrams]], `node scripts/quiz-diagrams-check.ts` (one cache quiz from the outline and lesson of [[samples/cache|the cache sample]]), 7 real calls over 5 runs (2026-10-09 and 10).

- **0 Diagrams in the first run**: the first wording made the field optional and invited omission. Firmer wording (every scenario with components or a request flow gets one) gave 2/8, 4/8 and 2/8 Diagrams, always on the scenarios.
- **Unexplained refusal**: it was the existing notion-coverage refinement (8 notions in 8 questions, one notion missed), not a Diagram check. The automatic retry doubled the time (about 34 s). `quiz-6` states the rule in the prompt; the next two runs passed first time.
- **300 s timeout**: not reproduced, and the 300 s came from the script's override. Every call was one structured-output message with no thinking: 17.0 to 18.6 s wall time for 8 questions (about 2.6k output tokens, first JSON fragment after about 2 s). The prompt (26k characters) and JSON schema (4.6k characters) are not the bottleneck. In the app, quiz calls use `DEFAULT_TIMEOUT_MS` (120 s, asserted in `pipelines.test.ts`); a hung call ends with the typed `timeout` error (`service.test.ts`, `cliRunner.test.ts`).
- **Quality**: every Diagram was valid (3 to 4 nodes), passed the leak check and was answerable from the lesson, but most only restate the scenario's components. One `quiz-6` Diagram drew the write-through chain on a "which write strategy" question: a structural leak that the text check cannot catch. `quiz-7` forbids drawing a choice's flow, and the same question then got a neutral drawing (one run). The `quiz-6` scenario Diagrams were drawn in the built app's quiz player on a scratch profile: readable, named after the prompt, still drawn after answering.
