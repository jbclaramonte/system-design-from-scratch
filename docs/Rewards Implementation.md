---
title: Rewards Implementation
tags: [assessment, architecture, ui]
issue: 65
---

# Rewards Implementation

How the app rewards mastery: [[XP]], [[Level]] and [[Badge]]s, derived from the learner's history. **Rewards mastery only**: no tokens, no currency, no leaderboard, no notification, no sound (the celebration of a Badge is #66). Built on the [[Activity Streak]] (#64), the [[Mastery Loop Implementation|Mastery Loop]] and the [[Interview Protocol Implementation|Interview Protocol]].

## Model

Nothing is stored except which Badges were unlocked and celebrated (`celebrated_badges`, migration 10). XP, Level and Badges are pure functions over the history, so a history that predates the feature counts at once.

- `src/shared/rewards.ts`: the three rule tables (`XP_RULES`, `LEVELS`, `BADGES`) and the types. Changing a rate, a threshold or adding a Badge of an existing kind is an edit of this file only.
- `src/main/rewards/rewards.ts`: pure functions, tested in `rewards.test.ts`. `xpEvents(history)`, `levelProgress(xp)`, `badgeUnlocks({ history, dayOf, now })`, `buildRewardsSummary`, `roundXpAwards`, and a ledger (`emptyLedger`, `payEvent`) for the incremental computation. The clock (`now`) and the time zone (`dayOf`) are injected like in `src/main/activity/activity.ts`.
- `src/main/rewards/queries.ts`: `loadRewardHistory(db)` reads the topics, the completed `rounds`, the reviewed `protocol_step_submissions` and the first `final_review` of each Design Exercise. A Declared Mastery, a Forced Unlock and everything about Lessons are not read, so they cannot pay.
- Recomputation equals incremental: every XP event has a key (`round:12`, `topic:3`, `step:2:api`, `exercise:2`) and the same key never pays twice. Adding history never changes an event already paid (a Topic's first mastery stays on the Round that earned it). Tests replay a seeded history prefix by prefix through the ledger and compare with the recomputed total, and shuffle the input order.

## XP rules

| Event | XP | Pays once per | Notes |
|---|---|---|---|
| Completed Round | `round(score / 5)`, 0 to 20 | Round | Open Rounds pay nothing |
| Round passed (stored `passed`) | +10 | Round | "+30 XP: Round passed" for a 100% Round |
| Topic mastered | +50 | Topic | The first passed Round of the Topic, even when the Topic was declared as known before; later passes pay only the Round |
| Protocol step passed | +15 | Design Exercise and step | The first reviewed submission; submitting the step again pays nothing |
| Design Exercise completed | +100 | Design Exercise | Its first final review |

Pay nothing: a [[Declared Mastery]], a [[Forced Unlock]], reading a [[Lesson]], a [[Lesson Question]], a [[Question Clarification]], re-reading, a failed or pending Protocol Step submission, an open Round.

## Levels

A Level is the highest row whose threshold the total XP reaches. The last Level has no next one.

| Level | Name | Total XP |
|---|---|---|
| 1 | Novice | 0 |
| 2 | Apprentice | 100 |
| 3 | Builder | 250 |
| 4 | Designer | 500 |
| 5 | Engineer | 800 |
| 6 | Senior Engineer | 1200 |
| 7 | Staff Engineer | 1700 |
| 8 | Principal Engineer | 2300 |
| 9 | Architect | 3000 |

For scale: mastering all 21 Topics at the first try with a perfect score is 1,680 XP, and the eight Design Exercises are about 1,640 XP more.

## Badges

A Badge unlocks at the time of the event that completed its rule and stays earned. Rules are `BadgeCriterion` kinds; a new Badge of one of these kinds is a data change, a new kind needs a case in `badgeUnlocks`.

| Id | Title | Rule | Criterion |
|---|---|---|---|
| `first-topic-mastered` | First Topic mastered | Master a Topic by passing a Round | `topics_mastered` 1 |
| `foundations-completed` | Foundations complete | Every [[Foundations Module]] Topic mastered by a passed Round (a declared one does not count); dated by the last | `foundations_completed` |
| `perfect-round` | Perfect Round | A completed Round at 100% | `perfect_round` |
| `comeback` | Comeback | A passed Round on a Topic after a failed Round on the same Topic (Rounds ordered by completion time) | `comeback` |
| `streak-7` | 7-day Activity Streak | The [[Activity Streak]] reached 7 days at some point (grace day included), dated by the last event of that day; it stays earned when the streak ends | `activity_streak` 7 |
| `first-design-exercise` | First Design Exercise completed | A final review is recorded | `design_exercises_completed` 1 |

## Data

Migration 10 `celebrated-badges`: table `celebrated_badges (badge_id PK, unlocked_at, celebrated 0/1, created_at, updated_at)` ([[Data Model]]), repository `src/main/db/repositories/badges.ts` (`recordBadgeUnlocks` inserts and never changes a known row, `listBadgeUnlocks`, `markBadgeCelebrated`). `badge_id` is the id of `BADGES`, not a foreign key. `rewards:get` records the Badges earned so far (insert only), so a Badge keeps the time it first unlocked; rows are uncelebrated until #66 marks them. On a first read of an old history every earned Badge is inserted uncelebrated: #66 decides how to treat those.

## IPC

| `window.api` | Channel | Notes |
|---|---|---|
| `getRewards()` | `rewards:get` | `RewardsSummary`: total XP, `LevelProgress`, every Badge with `earned` and `unlockedAt`. No request field (zod `{}`): the clock and zone are the main process's |
| `getRoundXp({ roundId })` | `rewards:getRound` | `RoundXp`: what the Round paid, `awards` with `xp` and `reason`; refuses an open, unknown or malformed Round (zod `roundId` positive integer, no other key) |

The screens reload on `path:changed` (pushed after `quiz:completeRound`), so no new event was added.

## Screens

`src/renderer/src/rewards/` (text helpers in `rewardsText.ts`, tested):

- `LevelCard`: "Level 4 Designer", total XP in mono, a `progressbar` to the next Level ("11 / 300 XP to Engineer", `aria-valuetext` says the same in words), "Top Level reached." at the end. `side` variant above the Streak card in the Learning Path side panel; `wide` variant on the [[Dashboard]] overview.
- `BadgesSection` (Dashboard, after the Overview): one card per Badge in an icon tile (`.icon-tile`, tile tokens: mastered tone when earned, neutral when locked), the title, the rule, and the status in words in a chip ("Earned 17 Oct 2026", or a lock and "Locked"). The rule is shown on locked Badges too, so they say how to get them. A hidden sentence gives the screen reader the whole card ("Perfect Round: locked. Score 100% on a completed Round."). A locked Badge is neutral, never red.
- `RoundXp`: under the score of the Round results (`QuizResults`, used by the topic screen and the dev quiz): "XP earned", one line per award ("+25 XP: Round passed", "+50 XP: Topic mastered") and the total when there are several. Nothing when the Round paid 0 XP or cannot be read.

## Verification (2026-10-24, #65)

- Tests: `src/main/rewards/rewards.test.ts` (XP per event, no double pay, excluded events, levels, every Badge rule and edge case, a Badge added as data, recomputation versus incremental), `rewardsIpc.test.ts` (migrated database: fresh install, existing history counting at once, Badges remembered once and a celebration kept, Declared Mastery, Forced Unlock and open Round paying nothing, Protocol Steps, Design Exercise, `rewards:getRound`, validation), `src/main/db/migration10.test.ts`, `src/renderer/src/rewards/rewardsText.test.ts`.
- Dev app over the Chrome DevTools protocol, scratch `--user-data-dir` and HOME, a scratch wrapper around the fake CLI for the free answer: fresh install (Level 1, 0 XP, six locked Badges) and a seeded history (a failed then passed Round, six Foundations Topics, an 8-day streak, a reviewed Protocol Step: Level 4, 511 XP, five Badges earned, the Design Exercise Badge locked), light and dark; a Round played in the dev quiz showed "+25 XP: Round passed", "+50 XP: Topic mastered". `smoke:packaged` checks the Level card on a fresh install and the Level and Badges after seeded Rounds.

## Related

- [[XP]], [[Level]], [[Badge]], [[Activity Streak]], [[Declared Mastery]], [[Forced Unlock]]
- [[Dashboard Implementation]], [[Learning Path Implementation]], [[Mastery Loop Implementation]], [[Data Model]], [[Design System]]
