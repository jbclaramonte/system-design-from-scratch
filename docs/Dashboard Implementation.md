---
title: Dashboard Implementation
tags: [assessment, architecture, ui]
issue: 18
---

# Dashboard Implementation

How the app shows where the learner stands: the [[Dashboard]] with an overview, the mastery of each [[Topic]], the [[Notion Map]], the [[Weak Point]]s and the [[Attempt]] history. Built on the [[Mastery Loop Implementation|Mastery Loop]] read models and the [[Learning Path Implementation|Learning Path]].

## Model

The Dashboard is **never stored**: it is a read model computed from the database on every call. No migration, no table. Two layers in `src/main/dashboard/`:

- `queries.ts`, `loadDashboardSnapshot({ db, corpus })`: the Learning Path (`getLearningPath`), then for each topic step its [[Notion Outline]], its [[Round]]s with their per-notion scores (`roundNotionScores`, completed rounds only) and every attempt of each round (question prompt from `listQuestionHistory`, replaced questions included).
- `model.ts`, `buildDashboard(snapshot, { historyTopicId })`: pure aggregation, unit-tested. Types in `src/shared/dashboard.ts`.

Data sources:

| Part | Source |
|---|---|
| Path progress, topic status, lock | `getLearningPath` (topics mastered over topics, step status, `lockedBy`) |
| Rounds | `rounds` (number, `score_percent`, stored `passed`, dates) |
| Notion scores | `attempts` + `attempt_notions` of the questions in play in each completed round (`roundNotionScores`, the scores the [[Quiz Engine]] uses) |
| Attempt history | every attempt of a round, with `question_type`, `result`, notion tags, `feedback` (free answers) |
| Threshold, Round Limit | `settings` (current values) |

## Rules

### Overview

- Path progress: the Learning Path progress (topics mastered over topics).
- Rounds: completed, and in progress (open).
- Attempts: every recorded attempt, open rounds included.
- Accuracy: sum of attempt scores over attempts (scores are all-or-nothing, so the share of correct answers). Null without attempts.
- Last activity: latest attempt, round start or round completion. The renderer shows it as "2 hours ago".

### Topics

Per Learning Path topic: status (the path step), rounds (number, status, score, dates), best and latest completed score, the [[Round Limit]] count (completed rounds below the threshold since the last passed one, as in the Mastery Loop), notions mastered over the outline, last practiced (latest attempt or round start).

- An **open round** (started, never completed, for example abandoned) is shown `in_progress`: never a failure, no score, not in the Round Limit count, not in the notion scores. Its attempts count as practice (attempt count, accuracy, last practiced).
- A round's status (`passed` or `failed`) is the **stored** `passed`: a later [[Mastery Threshold]] change never rewrites it.

### Notion Map

One cell per notion of every topic with a Notion Outline (a topic with an outline but no attempts shows every notion "not tested yet"):

- **Latest score**: the notion's score in the most recent completed round that tested it (same rule as `latestNotionScores`). Null when untested.
- **Scores**: the notion's score in each completed round that tested it, oldest first.
- **Attempts** and **last practiced**: attempts tagged with the notion, open rounds included.
- **Mastered**: latest score meets the **current** Mastery Threshold. So a threshold change moves notions between mastered and not mastered at once, while rounds keep their stored outcome.
- **Trend**: over the last 3 scores, the latest one compared with the mean of the previous ones in that window: more than 5 points above is `improving`, more than 5 points below is `regressing`, otherwise `flat`. Null with fewer than 2 scores. Examples: 0, 0, 100 is improving; 0, 100, 0 is regressing; 0, 100, 100, 100 is flat (only the last 3 count).

### Weak points

A notion is a [[Weak Point]] when it was **tested in at least one completed round and its latest score is below the current Mastery Threshold** (that is, a tested notion that is not mastered). For each one:

- `roundsTested`: completed rounds that tested it; `roundsMissed`: those where its score was below the current threshold (at least 1, its latest round).
- `missedInLastRound`: it was tested in the latest completed round of its topic and scored below the threshold there.
- Reason, in English: "Missed in 3 of 3 rounds, including the last one", "Missed in 1 of 1 round, the last one", plus ", regressing" when its trend is regressing.

Order, most urgent first: lowest latest score, then most rounds missed, then most recently practiced.

Untested notions are never weak points (they show as "not tested yet" in the Notion Map). A notion of a mastered topic can be a weak point (a pass below 100%, or a threshold raised later).

### Attempt history

Rounds most recent first (by start date), at most 50 (`HISTORY_ROUND_LIMIT`), each with its attempts: prompt (French), question type, result, notions, date. A free answer whose grade was contested shows its current (re-graded) result with "contested, re-graded" (the grading record's `contest`, see [[Quiz Engine]]). `dashboard:get` with a `topicId` restricts the history to that topic; the rest of the Dashboard is always the full picture.

## IPC

| `window.api` | Channel | Notes |
|---|---|---|
| `getDashboard({ topicId? })` | `dashboard:get` | Validated with zod (`topicId` positive integer, no other key); a topic outside the Learning Path is refused |

Refresh: the Dashboard screen reloads on every `path:changed` push (sent after `quiz:completeRound` and `mastery:choose`, see [[Learning Path Implementation#Service and IPC]]), so no new event was added.

## Screen

`src/renderer/src/dashboard/`, opened with the **Dashboard** item of the app header (`src/renderer/src/shell/AppShell.tsx`, see [[Design System#App shell]]):

- `DashboardScreen`: focus moves to the "Dashboard" heading on open. Overview cards; weak points (first 8, "Show all"); the Notion Map; the topics table (status badge, notions mastered as a `progressbar` with a text value, rounds in a disclosure, best, latest, Round Limit, last practiced); the attempt history with a topic filter (a `<select>` that reloads through `dashboard:get`).
- **Practice** (weak points and topics table) opens the Mastery Loop topic screen, like the Learning Path; its back button returns to the Dashboard. A locked topic keeps a focusable button marked `aria-disabled`, with the lock reason ("Locked. Master X first.") as its description. A weak point's topic is never locked in practice: a topic with progress is never locked ([[Learning Path Implementation#Rules]]).
- `NotionMap.tsx`: one heat grid per topic. Cells use the Okabe-Ito palette (blue mastered, yellow 50% to below the threshold, dark orange below 50%, grey hatch untested), chosen to stay distinct with common colour vision deficiencies, and **colour is never the only cue**: each cell writes its score and a symbol (✓, ◐, ✗, ○). The legend repeats colour, symbol and range. Each cell is a button whose accessible name is the full description ("Cache-aside: latest score 50%, not mastered, trend improving, 4 attempts, last practiced 2 hours ago"); selecting it shows its details (scores by round, trend, attempts) under the grid.
- Empty state (no round and no attempt): what the Dashboard will show, and a button back to the Learning Path.
- `dashboardText.ts`: labels, heat levels, descriptions, durations (tested).

### Visual design

Issue #31, on the dark [[Design System]] (tokens and shared classes only, no literal colors). The Dashboard has a hero card for the Learning Path (mono count, `progress` bar, `aria-valuetext`) and four stat cards (mono numbers, caps labels); the Mastery Threshold note keeps its value in mono. Weak points are cards in a grid: a score chip (red below 50%, amber above, with the dot and the written "Latest 20%"), a neutral topic chip, the reason and a small Practice button. The Notion Map shows each topic in a card; a cell is a dark elevated button with a stripe of its heat color on the left and a score badge filled with the Okabe-Ito color, so the hues stay distinguishable on the dark background while the symbol (✓, ◐, ✗, ○) and the score stay written in the badge; the legend uses the same badges. The Topics table sits in a card (mono caps column heads, status chips from `stepStatusChip`, a shared `progress` bar, a red "Round Limit reached" chip); the history rounds are bordered cards with status and result chips (`roundStatusChip`, `resultChip`, pure and tested in `dashboardText.test.ts`). Settings groups its fields in two cards: "Claude Code" (CLI path, Claude config directory, the Test button and its result with a Failed/OK chip and a Logged in/Not logged in chip) and "Mastery Loop" (Mastery Threshold, Round Limit, questions per quiz), each field with a label and helper text (the error replaces it in red), a primary Save button and a green "Saved" confirmation. About shows the app and its license in a header card, the Primer attribution and the tldraw notice (amber border, "Source-available" chip) as cards, license notices folded in disclosures, and the third-party packages as a filterable list of disclosures with a license chip.

## Verification (2026-10-09)

- Tests: `src/main/dashboard/model.test.ts` (trend, reason, empty Dashboard, outline without attempts, aggregation, open round, threshold change, weak-point order, history order, filter and limit), `dashboardIpc.test.ts` (from a migrated database with the bundled corpus: fresh database, rounds and attempts with a contested free answer and an open round, threshold change, filter, request validation), `src/renderer/src/dashboard/dashboardText.test.ts`. No component test: there is no DOM test environment in the repo.
- Built app driven over the Chrome DevTools protocol, scratch `--user-data-dir`, `CLAUDE_CLI_PATH` set to a missing file (no Generation can run). Database seeded with the repository helpers: a Foundations Module topic mastered after 2 failed rounds, one mastered at the first round with a contested free answer, one skipped after 3 failed rounds, one with an open round (2 answers). Checked: overview (2 of 21, 7 rounds + 1 in progress, 33 attempts, 63.6%), 3 weak points in the expected order with their reasons, heat grid levels, symbols and accessible names, cell details, locked Practice (`aria-disabled`, reason, a click does nothing), Practice on a weak point opening the topic screen and its back button returning to the Dashboard, history filter, contested free answer, the `path:changed` refresh (a Round Limit choice turned "Skipped" into "In progress" without reload), a threshold change to 50% (legend without the middle level, rounds keep "Below threshold"), the empty state on a fresh database and its link to the Learning Path.
- Not checked: a real CLI, a round completed in the UI while the Dashboard is open (the screen is not visible then; the reload on mount covers it), screen reader output (only the accessible names were read).

## Related

- [[Dashboard]], [[Notion Map]], [[Weak Point]], [[Attempt]], [[Round]], [[Notion]], [[Mastery Threshold]], [[Round Limit]]
- [[Mastery Loop Implementation]], [[Learning Path Implementation]], [[Quiz Engine]], [[Data Model]]
