---
title: Mastery Loop Implementation
tags: [assessment, architecture, ui]
issue: 11
---

# Mastery Loop Implementation

How the app drives a [[Topic]] through the [[Mastery Loop]]: [[Lesson]], [[Quiz]] played as a [[Round]], results per [[Notion]], one [[Remediation Lesson]] per missed notion, a new quiz with fresh questions, and so on until the [[Mastery Threshold]] is met, bounded by the [[Round Limit]]. Built on the [[Quiz Engine]], the [[Lesson View]] and the [[Prompts]]. Settings screen included.

## State machine

The loop has no stored "current step": the step is **derived from the database** every time (rounds, their per-notion scores, Remediation Lessons, Round Limit choices, settings). So it survives restarts and never drifts from the history. Pure code in `src/main/mastery/state.ts` (`deriveMastery`), snapshot loaded by `loadMasterySnapshot` (`queries.ts`).

```mermaid
stateDiagram-v2
  [*] --> lesson
  lesson --> round: lesson read, start round 1
  round --> mastered: score >= threshold
  round --> remediation: score below threshold, failed rounds < Round Limit
  round --> limit_reached: failed rounds >= Round Limit
  remediation --> round: every Remediation Lesson read, start next round
  limit_reached --> remediation: another angle
  limit_reached --> skipped: skip
  skipped --> remediation: come back (another angle)
  mastered --> [*]
```

| Step | When | Topic mastery |
|---|---|---|
| `lesson` | No round yet. `lessonReady` once a `lessons` row exists. | `not_started` (no lesson, no round) or `in_progress` (lesson recorded, or a round opened and left) |
| `round` | A round is open (started, not completed) with a number above the last completed one: it is **resumed**, never restarted. | `in_progress` |
| `remediation` | The latest completed round failed and the limit is not reached, or the learner chose another angle. Targets: the missed notions with their angle and whether their Remediation Lesson is recorded. | `in_progress` |
| `limit_reached` | Failed rounds since the last passed one >= Round Limit, no choice recorded on the latest round. | `limit_reached` |
| `skipped` | `skip` chosen on the latest round. | `skipped` |
| `mastered` | The latest completed round passed. | `mastered` |

Rules:

- **Topic status** (#25): the status of `deriveMastery` is the only topic status of the app, read through `getTopicMastery` by the topic header (`mastery:getState`), the [[Learning Path]] (and so its recommended step) and the [[Dashboard]] topics table. A topic is `not_started` until a [[Lesson]] is recorded (`lessons` row, written before the lesson's `done` event is sent) or a [[Round]] is opened (an open or abandoned one included); then `in_progress` until `mastered`, `skipped` or `limit_reached`. A topic with progress is never `locked` on the path. The topic screen reloads the state when the lesson is done and when a round opens, so the header shows "In progress" with the round/attempt line during the lesson and round 1; before the lesson it reads "Read the lesson, then take round 1".
- **Round Limit count** = completed rounds below the threshold since the last passed round (`failedRoundsSinceLastPass`). An open (abandoned) round never counts; it keeps its number when resumed, so a number is never burnt twice. Numbers are unique per topic and never restart ([[Quiz Engine#Round lifecycle]]).
- **Missed notion** = per-notion score below the current Mastery Threshold (`missedNotions`). If a failed round has none (possible below 100%: a question on two notions counts for both), the notions with a wrong answer are targeted, so a failed round always has remediation.
- **Threshold changes**: `rounds.passed` is stored at completion, so a later change never passes or fails a past round; it changes the targets of the current remediation and the next rounds. A changed Round Limit applies at once (a remediation step can turn into `limit_reached`).
- **Angles**: each Remediation Lesson on a notion takes the next angle not used yet for it, in the order `concrete_example`, `analogy`, `contrast`, `guided_questions` (then cycles), and the prompt gets the `usedAngles` ("use a clearly different style, example and situation"). With the default limit of 3, "another angle" gets `contrast`, a style the learner has not read.
- **At the Round Limit**: "another angle" records `another_angle` on the latest round (remediation with a new angle, then a new round); "skip" records `skip`. A failure after another angle offers the choice again: there is no endless loop. Coming back to a skipped topic records `another_angle` on the same round.
- `cannotStartRound(step)` and `cannotChoose(step, choice)` are the guards; the service refuses an action they reject.

## Service and IPC

`createMasteryService` (`src/main/mastery/service.ts`):

- `startRound(topicId)`: resumes the open round, or builds the next quiz request, runs it through the [[Generation Service]] (a [[Content Cache]] hit when pre-generated), stores the quiz (`saveQuiz`; an unplayed quiz with the same cache key is reused, in case the app quit between storing and starting) and starts the round with the quiz service.
- Quiz options (`quizOptions.ts`): round 1 = `firstRoundQuizOptions(lessonMarkdown, settings)`, **the same function the lesson flow uses for its [[Pre-generation]]**, so the first round is a cache hit (tested by comparing cache keys and counting CLI calls). Next rounds = `{ lessonMarkdown, focusNotions: missed, reminderNotions: the others, avoidPrompts: every prompt of the quizzes played on the topic }`. `count` only when the "questions per quiz" setting is set.
- `prepareRemediation` / `recordRemediation`: the Remediation Lesson request of a target (angle, `usedAngles`, the prompts of the questions missed on that notion), and the `remediation_lessons` row (with the round), once per round and notion.
- `pregenerateRemediationStep`: when the first Remediation Lesson of a step is opened, the other ones and the next quiz are pre-generated in the background.
- `choose(topicId, choice)`: the Round Limit choice.

`createMasteryIpc` (`masteryIpc.ts`), channels in `src/shared/ipc.ts`, types in `src/shared/mastery.ts`:

| `window.api` | Channel | Notes |
|---|---|---|
| `listMasteryTopics()` | `mastery:listTopics` | Topics with their mastery |
| `getMasteryState({ topicId })` | `mastery:getState` | `MasteryState`: step, round number, failed rounds, threshold, limit, last round |
| `startMasteryRound({ requestId, topicId })` | `mastery:startRound` | Events `queued`, `started`, `retry`, `error`, then `round_ready { start }`. The quiz `done` event is never sent: it holds the answer keys. |
| `startRemediation({ requestId, topicId, notionId })` | `mastery:startRemediation` | Lesson events: `prepared`, then the streamed Generation events |
| `cancelMastery({ requestId })` | `mastery:cancel` | A closed window cancels its requests too |
| `chooseAtRoundLimit({ topicId, choice })` | `mastery:choose` | `another_angle` or `skip` |
| `onMasteryEvent(listener)` | `mastery:event` | `{ requestId, event }` |

Errors end a stream with a typed `{ code, message }` ([[Generation Service#Errors]]).

Read models for the [[Notion Map]] (#17) and the [[Dashboard]] (#18), in `queries.ts`: `getTopicMastery(db, topicId)`, `listTopicMasteries(db)`, `latestNotionScores(db, topicId)` (per notion, the score in the most recent completed round that tested it), `roundNotionScores(db, round)`.

## Topic screen

`src/renderer/src/mastery/`: a topic opened from the [[Learning Path Implementation|Learning Path]] home screen shows `TopicScreen` (the dev-only "All topics (dev)" entry keeps `MasteryView`, the topic list with mastery badges):

- Heading hierarchy (#21): the topic title once, as the screen heading (`PathTopicView`'s `h1`, next to the back button), then the progress line, then the step content. `TopicScreen` takes `showTitle` (default `true`, so the dev "All topics" screen keeps its `h2`; `PathTopicView` passes `false`) and renders `LessonScreen` with `embedded`, which drops its own title and Outside the primer badge. The round results inside the topic screen do not repeat the badge either.
- Progress line (`TopicHeader`): status badge, the Outside the primer badge (the only one on the screen), round number, "attempt k of N before the Round Limit", Mastery Threshold.
- `lesson`: the [[Lesson View]] screen (`LessonScreen`, streamed or from cache), then "Take the quiz".
- Round: the quiz player of the [[Quiz Engine]] (`QuizPlayer`, unchanged), then `QuizResults` with the per-notion breakdown and "Continue".
- `remediation`: one tab per missed notion with its score, the streamed Remediation Lesson (`RemediationLesson`, with its angle and "Generated" / "From cache"), "Next notion", then "Start round N" once all are recorded.
- `limit_reached`: the two choices; `skipped`: "Come back now with another angle"; `mastered`: the passing round.
- Cancel while a quiz or a Remediation Lesson is generated, typed error titles, Retry. Leaving the screen cancels running requests; reopening the topic resumes the step (an open round is resumed at once).

The separate Lessons and Quiz screens stay reachable in dev builds only ("Lessons (dev)", "Quiz (dev)").

## Settings

`SettingsScreen` (`src/renderer/src/settings/`), `settings:get` / `settings:update` / `settings:testCli` (`src/main/settings/`), validation shared in `src/shared/settings.ts` (`settingsErrors`):

| Setting | Key | Default | Valid |
|---|---|---|---|
| Mastery Threshold | `mastery_threshold` | 100 | whole percent 50 to 100 |
| Round Limit | `round_limit` | 3 | 1 to 10 |
| Questions per quiz | `questions_per_quiz` | `null` (automatic: max(6, targeted notions)) | 4 to 20 |
| Claude Code CLI path | `claude_cli_path` | `null` (automatic lookup) | absolute path |
| Claude config directory | `claude_config_dir` | `null` (inherit the environment) | absolute path of an existing directory |

Applied without restart: the threshold and limit are read on every action; a CLI path change calls `GenerationService.resetCliPath()`, so the next Generation resolves it again; the Claude config directory is read on every CLI call and passed as `CLAUDE_CONFIG_DIR` ([[Generation Service#Claude profile]]). The path setting wins over the `CLAUDE_CLI_PATH` environment variable, which stays as a fallback for development and tests. "Test" resolves the CLI like a Generation does (configured path first, no silent fallback), runs `claude --version`, then `claude auth status --json` in the configured profile, and shows the login state, auth method, account email and config directory, with what to do when logged out.

`claude_config_dir` was added without a migration (the `settings` table is key/value): `getSettings` reads it as `null` until the first save writes the row (`unseededDefaults` in `src/main/db/repositories/settings.ts`).

"Open Settings": every Generation error display (lesson, Remediation Lesson, quiz preparation, free-answer grading, Protocol Step Lesson and protocol calls, dev Generation panel) is `GenerationErrorView` ([[Generation Service#Error display]]); for `not_logged_in` and `cli_not_found` it shows "Open Settings" next to Retry, which opens the Settings screen (`OpenSettingsContext`, provided by `App`; Back returns to the screen it was opened from).

## Data

Migration 3 `mastery-loop` ([[Data Model]]): table `round_limit_choices (round_id PK, choice)` (repository `src/main/db/repositories/mastery.ts`), settings `questions_per_quiz` and `claude_cli_path`. Remediation Lesson prompt version `remediation-lesson-2` (two new angles, `usedAngles`).

## Verification (2026-10-09)

- `npm run lint`, `format:check`, `typecheck`, `test`, `build` pass. Tests: `src/main/mastery/state.test.ts` (transitions: pass first time, fail then remediation then pass, limit reached with both choices and a second limit, abandoned round resumed and not counted, stale open round, threshold and limit changes), `service.test.ts` (first quiz served by the lesson Pre-generation, with automatic and fixed question counts; `avoidPrompts`, focus and reminder notions; remediation only on missed notions, cached and recorded once; resume after restart without a Generation; IPC events without the quiz content; typed CLI error), `src/main/settings/settings.test.ts`, `src/renderer/src/mastery/masteryText.test.ts`.
- Built app driven over the Chrome DevTools protocol, scratch `--user-data-dir`, `CLAUDE_CLI_PATH` pointing to a deterministic fake CLI (outline, lesson, quiz built from the JSON schema, Remediation Lesson, free-answer grading):
  - Full loop on `cache`: round 1 failed on one notion (66.7%) → 1 Remediation Lesson (`concrete_example`) → round 2, app quit after 2 answers and relaunched: resumed at question 3 of round 2 → failed → Remediation Lesson (`analogy`) → round 3 passed → Mastered. 3 quiz CLI calls in total, all Pre-generations (the lesson flow's, then one per remediation step): each round start was a cache hit. Database: rounds 1, 2, 3 with `passed` 0, 0, 1; 6 attempts per round; 2 `remediation_lessons` rows tied to rounds 1 and 2; quiz cache inputs with `targetNotions` = the missed notion and `avoidPrompts` of 6 then 12 prompts.
  - Round Limit on `load-balancer`, with `CLAUDE_CLI_PATH` set to a missing file and the fake set in the Settings screen ("Test" showed its version; Round Limit 0 refused, 2 saved): round 1 failed on 2 notions → 2 Remediation Lessons (the second one from the cache, pre-generated) → round 2 failed → Round Limit screen → Skip (list shows "Skipped") → Come back with another angle (`analogy`) → round 3 passed → Mastered. Every Generation went through the path from the settings.
- Not checked in the app: a real CLI, the error and Cancel paths of the topic screen (covered by unit tests only), the "another angle" button itself (the same choice as "come back", which was clicked), a Foundations Module topic.

## Related

- [[Mastery Loop]], [[Round]], [[Round Limit]], [[Mastery Threshold]], [[Remediation Lesson]], [[Notion]]
- [[Quiz Engine]], [[Lesson View]], [[Prompts]], [[Generation Service]], [[Data Model]]
