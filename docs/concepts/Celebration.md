---
title: Celebration
tags: [concept, ui, assessment]
issue: 66
---

# Celebration

The short, tasteful moment that marks a [[Round]] passed, a [[Level]] reached or a [[Badge]] earned. CSS only, no sound, no new dependency, and it never gets in the way of the next action.

- **Passed Round**: on its results screen the [[XP]] total ticks up from 0 and the XP card glows softly.
- **Badge earned** and **Level reached**: a card slides in at the bottom corner (the Badge title and how it was earned, or "Level 3: Builder"), one at a time, in unlock order. It is not modal, can be dismissed and goes away by itself after a few seconds.
- **Once**: the main process remembers each Badge and Level once its card was shown, so a celebration never replays after a reload or a restart.
- **Never for the past**: whatever was earned before the first time the rewards were read on an install is the baseline and is never celebrated; only what unlocks afterwards is.
- **Never for a failed Round**: a failed Round gets its usual feedback only. A Round being played or failed holds the cards of Badges and Levels until its results are closed.
- **Calm**: nothing red, nothing negative, status never by color alone; unlocks are announced politely to screen readers (a live region); with `prefers-reduced-motion` nothing moves and the same content shows still; the **Celebrations** setting (Settings, default on) turns the animation off while the XP line and the Badges stay.

## Related

- [[XP]], [[Level]], [[Badge]], [[Round]], [[Mastery Loop]]
- Rules, baseline and screens in [[Rewards Implementation#Celebrations]]; the setting in [[Mastery Loop Implementation#Settings]]

## In code

`whatToCelebrate` in `src/shared/celebrations.ts`; `rewards:getCelebrations` and `rewards:markCelebrated`; `CelebrationProvider`, `CelebrationCard` and `celebrations.css` in `src/renderer/src/celebrations/`; `RoundXp` in `src/renderer/src/rewards/`; the `celebrations` setting.
