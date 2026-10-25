---
title: Rewards Implementation
tags: [assessment, architecture, ui]
issue: [65, 66]
---

# Rewards Implementation

How the app rewards mastery: [[XP]], [[Level]] and [[Badge]]s, derived from the learner's history. **Rewards mastery only**: no tokens, no currency, no leaderboard, no notification, no sound. A passed Round, a Level reached and a Badge earned are marked by a short [[Celebration]] (#66, see below). Built on the [[Activity Streak]] (#64), the [[Mastery Loop Implementation|Mastery Loop]] and the [[Interview Protocol Implementation|Interview Protocol]].

## Model

Nothing is stored except which Badges were unlocked and celebrated (`celebrated_badges`, migration 10) and the Level celebrated so far (the `celebrated_level` marker, #66). XP, Level and Badges are pure functions over the history, so a history that predates the feature counts at once.

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

Migration 10 `celebrated-badges`: table `celebrated_badges (badge_id PK, unlocked_at, celebrated 0/1, created_at, updated_at)` ([[Data Model]]), repository `src/main/db/repositories/badges.ts` (`recordBadgeUnlocks` inserts and never changes a known row, `listBadgeUnlocks`, `markBadgeCelebrated`, and for the baseline `getCelebratedLevel`, `takeRewardsBaseline`, `raiseCelebratedLevel`). `badge_id` is the id of `BADGES`, not a foreign key. Every rewards call records the Badges earned so far (insert only), so a Badge keeps the time it first unlocked. The celebrated flag and the baseline are described under [[#Celebrations]]. No new migration came with #66.

## IPC

| `window.api` | Channel | Notes |
|---|---|---|
| `getRewards()` | `rewards:get` | `RewardsSummary`: total XP, `LevelProgress`, every Badge with `earned` and `unlockedAt`. No request field (zod `{}`): the clock and zone are the main process's |
| `getRoundXp({ roundId })` | `rewards:getRound` | `RoundXp`: what the Round paid, `awards` with `xp` and `reason`; refuses an open, unknown or malformed Round (zod `roundId` positive integer, no other key) |

| `getCelebrations()` | `rewards:getCelebrations` | `PendingCelebrations`: the earned Badges not celebrated yet, in unlock order, and the Level reached since the last celebration (`{ level, name, previousLevel }`) or `null`. Reading consumes nothing. No request field |
| `markCelebrated({ badgeIds, level })` | `rewards:markCelebrated` | Remembers what a card showed: each Badge flagged celebrated (an unknown or already celebrated id is ignored), the Level raised to `level` (never beyond the Level actually reached, never lowered). zod: `badgeIds` array of non-empty strings, `level` positive integer or `null`, no other key |

The screens reload on `path:changed` (pushed after `quiz:completeRound`), so no new event was added.

## Screens

`src/renderer/src/rewards/` (text helpers in `rewardsText.ts`, tested):

- `LevelCard`: "Level 4 Designer", total XP in mono, a `progressbar` to the next Level ("11 / 300 XP to Engineer", `aria-valuetext` says the same in words), "Top Level reached." at the end. `side` variant above the Streak card in the Learning Path side panel; `wide` variant on the [[Dashboard]] overview.
- `BadgesSection` (Dashboard, after the Overview): one card per Badge in an icon tile (`.icon-tile`, tile tokens: mastered tone when earned, neutral when locked), the title, the rule, and the status in words in a chip ("Earned 17 Oct 2026", or a lock and "Locked"). The rule is shown on locked Badges too, so they say how to get them. A hidden sentence gives the screen reader the whole card ("Perfect Round: locked. Score 100% on a completed Round."). A locked Badge is neutral, never red.
- `RoundXp`: under the score of the Round results (`QuizResults`, used by the topic screen and the dev quiz): "XP earned", one line per award ("+25 XP: Round passed", "+50 XP: Topic mastered") and the total when there are several. Nothing when the Round paid 0 XP or cannot be read. For a passed Round it celebrates, see below.

## Celebrations

A [[Celebration]] marks a Round passed, a Level reached and a Badge earned (#66). Rewarding mastery stays the rule: it celebrates the same events that pay, never a failed Round, never effort alone.

**What to celebrate** is one pure function, `whatToCelebrate` (`src/shared/celebrations.ts`, tested in `celebrations.test.ts`). Input: the Round on screen (`passed`: true, false, or null while it is played; its `RoundXp`), the pending Badges in unlock order, the Level reached, and the keys already shown. Output, in order: the XP of a passed Round (`round_xp`), each new Badge (`badge`), then the Level (`level`). Rules: nothing while a Round is open or when it failed (what unlocked stays pending until that screen is closed); nothing for a Badge not earned; a key (`badge:<id>`, `level:<n>`) already shown is never queued again; several Levels gained at once are one celebration ("You went up 2 Levels.").

**Once per unlock, with a baseline.** The main process keeps `celebrated_badges.celebrated` and the `celebrated_level` marker. A card flags what it shows through `rewards:markCelebrated` once it is on screen, so a reload or a restart replays nothing. The owner decision: what was earned *before* the first read of the rewards on an install must never celebrate. A Badge is derived from the history, so on an existing history every earned Badge looks "new" the first time; without a baseline the first launch after the update would replay the whole past. Instead, the first rewards read takes a **baseline**, once, in one transaction (`takeRewardsBaseline`): every Badge already earned is inserted as celebrated (rows a #65 build left uncelebrated are set to celebrated too), and the current Level is written to `celebrated_level`. The marker's absence is what says "baseline not taken"; there is no migration, so it also covers installs that went through #65. The main process takes it at launch (`createRewardsIpc`, then one `get()` in `src/main/index.ts`), before anything new can be earned, and every rewards call takes it if it is still missing. From then on a Badge inserted by `recordBadgeUnlocks` is uncelebrated, and a Level above `celebrated_level` is pending. Celebrating a Level only raises the marker. A fresh install takes the baseline at its first launch (Level 1, no Badge), so its first Badge celebrates.

**The card** (`src/renderer/src/celebrations/`): `CelebrationProvider` (in `App`, around the shell) loads the Settings and the pending celebrations on mount, on `path:changed` and on every change of screen (which covers a Badge earned in a Design Exercise, where no event is pushed), runs `whatToCelebrate`, and shows the head of the queue as a `CelebrationCard` at the bottom corner: icon tile, "Badge earned" or "Level reached", the title, the rule, a Dismiss button. Not modal (only the card catches the pointer; the Continue button stays clickable), 7 seconds, then the next one. Wording in `celebrationText.ts`, tested.

**Motion is CSS only**: `celebration-in` (slides in from the right while fading in, 480 ms) and `celebration-glow` (the `--glow-mastered` halo for a Badge, `--glow-progress` for a Level, both semantic tokens, so both themes work); the XP total ticks up through a registered custom property (`@property --xp-tick`, an integer animated from 0 to `--xp-total`, drawn by `counter()`; a visually hidden copy of the number carries the text). No timer drives the motion and nothing makes a sound.

**Accessible**: a polite live region (`role="status"`, always mounted) announces each unlock once ("Badge earned: Perfect Round. Score 100% on a completed Round."); the words carry the message, the animation only adds to it; nothing is red or negative; status is never by color alone. With `prefers-reduced-motion: reduce` there is no animation: the card is the same card, still (static glow), the XP figure shows its final number at once, and the live region still announces.

**Setting "Celebrations"** (default on, `celebrations`, Settings card of the same name): off drops the animation and the cards, and the XP line and the Badges (Dashboard) stay as they are. The cards that would have played are flagged celebrated without showing, so turning the setting on later does not replay them. A passed Round's XP total is then plain text.

**Failed Round**: `QuizResults` declares the Round on screen (`useRoundOnScreen(passed)`) and `QuizPlayer` declares it open; the provider shows no card while the Round is open or failed, and the failed results get the usual feedback and the XP line only. A Level reached through a failed Round celebrates later, once its results are closed.

## Verification (2026-10-24, #65)

- Tests: `src/main/rewards/rewards.test.ts` (XP per event, no double pay, excluded events, levels, every Badge rule and edge case, a Badge added as data, recomputation versus incremental), `rewardsIpc.test.ts` (migrated database: fresh install, existing history counting at once, Badges remembered once and a celebration kept, Declared Mastery, Forced Unlock and open Round paying nothing, Protocol Steps, Design Exercise, `rewards:getRound`, validation), `src/main/db/migration10.test.ts`, `src/renderer/src/rewards/rewardsText.test.ts`.
- Dev app over the Chrome DevTools protocol, scratch `--user-data-dir` and HOME, a scratch wrapper around the fake CLI for the free answer: fresh install (Level 1, 0 XP, six locked Badges) and a seeded history (a failed then passed Round, six Foundations Topics, an 8-day streak, a reviewed Protocol Step: Level 4, 511 XP, five Badges earned, the Design Exercise Badge locked), light and dark; a Round played in the dev quiz showed "+25 XP: Round passed", "+50 XP: Topic mastered". `smoke:packaged` checks the Level card on a fresh install and the Level and Badges after seeded Rounds.

## Verification of the Celebrations (2026-10-24, #66)

- Tests: `src/shared/celebrations.test.ts` (nothing for a failed or open Round, each unlock once, several unlocks queued in order, XP of a passed Round), `rewardsIpc.test.ts` (old history first read: nothing; a Badge or a Level unlocked afterwards celebrates once; reload: no replay; several Badges in unlock order; validation), `src/main/db/migration10.test.ts` (baseline taken once, Level only raised), `settings.test.ts` and `repositories.test.ts` (the `celebrations` setting), `celebrationText.test.ts`, `registerHandlers.test.ts` (channels).
- Dev app over the Chrome DevTools protocol (scratch `--user-data-dir` and HOME, the fake CLI for the free answer): an old history with the baseline erased (Level 2, the 7-day Badge earned): no card on the first read, after changing screen or after a restart, and the baseline stored; then a Round passed in the dev quiz: the XP ticks to 75, the Badge card ("First Topic mastered") then the Level card ("Level 3: Builder") slide in one after the other, the live region announces, both are flagged, a reload replays nothing; in light and dark; with reduced motion (animation `none`, same cards); with the setting off (no card, XP line and Badge kept, nothing replays when it is turned on). Animations were also slowed (CDP `Animation.setPlaybackRate`) to capture frames mid-way.
- `smoke:packaged`: the seeded history, written after the first launch took the baseline, plays three Badge cards and the Level 6 card, in order, once; nothing replays when changing screen.

## Related

- [[XP]], [[Level]], [[Badge]], [[Celebration]], [[Activity Streak]], [[Declared Mastery]], [[Forced Unlock]]
- [[Dashboard Implementation]], [[Learning Path Implementation]], [[Mastery Loop Implementation]], [[Data Model]], [[Design System]]
