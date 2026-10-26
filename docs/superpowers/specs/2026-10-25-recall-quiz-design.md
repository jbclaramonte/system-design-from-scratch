---
title: Recall Quiz and Memory Review, design
tags: [design, mastery-loop]
status: approved
---

# Recall Quiz and Memory Review

Design for spaced repetition in the app. Written 2026-10-25 from a conversation with the owner. What the owner said is marked **Decided**; everything else is the author's call or guess and is marked **Call** (to confirm while reading) or **Guess**. Nothing here is built or filed as an issue yet.

## Why

A learner finishes a Lesson, plays its Quiz until the Mastery Threshold is met, and moves on. Nothing ever brings an old Topic back, so what was learned a week ago is never checked again. Spaced repetition is the known way to make knowledge stick: ask again, later, and ask more about what keeps going wrong. The owner finished the first two courses and noticed there is no check on past lessons afterwards.

## What the learner gets

1. **Recall Quiz.** Before a new Lesson opens, a short quiz asks about earlier lessons, with more questions on the notions the learner often gets wrong.
2. **Memory Review.** A screen, reachable from the Dashboard, giving an overview of the notions the learner has trouble retaining, computed from the results of every quiz, with a way to practice them.

Mock-ups (Stitch project 9600754648682592259, Luminous Architect design system): "Recall quiz before the next lesson" and "Memory review: what is hard to remember". They show structure only. Ignore what Stitch invented: the "ArchForge" brand, the avatar, the notification bell, the "7-day drill" chip, the version tag, the footer and the "Start Review" button in the header. The sub-title of the quiz mock-up is wrong (it names one lesson); it must say it covers earlier lessons.

## Decided

- **When.** Before each new Lesson opens (Decided).
- **What it covers.** All earlier lessons except the one the learner has just finished (Decided). Excluding the last one is what creates the spacing. "Earlier lessons" are the Topics already passed: mastered by a Round or declared (see below).
- **Declared Mastery Topics are included** (Decided). They have no Attempt history, so their questions are all new, and the extra Generations this needs are accepted (Decided, see "Declared Topics without notions").
- **Always taken, never blocking** (Decided). The learner cannot skip the Recall Quiz; whatever the score, the next Lesson opens. A bad result has no consequence.
- **Questions: a mix of reused and new** (Decided).
- **Memory Review** shows, per notion, what the learner finds hard to retain, based on quiz results, and the Recall Quiz keeps coming back to those notions, but not only to them (Decided).
- **A first Lesson, or a second one when only one Topic is finished, has nothing to recall** (Decided). No Recall Quiz is shown when there is no eligible notion.

## Behavior, with the author's calls

### Recall Quiz

- About 6 questions (Guess). Roughly 3 to 4 are questions already asked in earlier Quizzes (reused as they are), and 2 to 3 are new questions, preferably on the notions the learner often misses, worded differently so they cannot be answered from memory of the old wording (Guess).
- Selection weights (Guess): more weight for notions often missed in the last 6 answers and for notions not seen for a long time; notions answered correctly many times in a row come back rarely but never disappear.
- **Pre-generation, so the learner never waits** (Call, built on the existing [[Pre-generation]] term). A batch of new questions is generated in the background once a Topic's Lesson has finished streaming (the same point where the first Round's quiz is already pre-generated today; the learner then reads and plays, which gives the Generation time), targeting the shaky notions of one Topic at that moment, and is stored. It is used by the Recall Quiz of a later Lesson, not by the one that follows immediately: a batch waits in storage until a Recall Quiz consumes it, and a batch that is a little stale is fine. If no batch is ready when a Recall Quiz is built, it uses reused questions only; it never waits for a Generation and never fails because of one. If there are no reused questions either, the Recall Quiz is skipped for that time.
- Cost: at most one batch Generation per opened Lesson, not one per Recall Quiz (Call), plus at most one for a declared Topic without a Notion Outline (see "Declared Topics without notions").
- Question types (Call): single choice, multiple choice and scenario only, all graded locally, so a Recall session never calls a Generation to grade an answer and never needs a contest of the grade. Old free-answer questions are not reused. The screen is the existing quiz screen: same presentation, Question Clarification, "I did not understand the question". It shows a "Recall" label and, on a notion that is often missed, an "Often missed" tag with the plain count ("You missed this notion in 3 of your last 4 quizzes").
- The result screen shows what was right and wrong, per notion, with the usual feedback. No pass or fail wording, no red, no streak language (mastery-only tone of the rest of the app).
- Leaving a Recall Quiz midway keeps its answers and resumes it next time the Lesson is opened (Call). A technical failure (the database, a missing question) must never trap the learner: the Lesson opens (Call).

### When it fires, and what is eligible (Call)

- **Trigger:** the first time the learner opens the Lesson of a Learning Path Topic (including a Topic opened by a Forced Unlock or by "Test me" on a declared Topic). Not on later visits to the same Lesson, not for Remediation Lessons or Protocol Step Lessons. It is keyed to the Topic being opened: a Recall Quiz left midway resumes when that Lesson is opened again, and once finished it is not asked again for that Topic.
- **Eligible Topics:** every Topic of the whole path that is passed (mastered by a Round, or declared), except the Topic passed most recently and the Topic being opened. Passed most recently is by date, so a path followed out of order still works: the rule is "not the latest one", not "not the previous one in the list".
- **Foundations Topics are Topics** like any other, and are eligible.

### What counts as one answer (Call)

For the "last 6 answers" of a notion: one result per Question per session (a Round or a Recall session), the final one, so replaying a Question inside one Round does not count several times. Only sessions that are completed count; an open or abandoned session does not. Declared Mastery and Forced Unlock never produce an answer.

### Memory Review

- Reached from the Dashboard (Decided); a header strip with the number of notions tracked, how many need attention and how many are getting steadier, and a button "Start a recall quiz on these".
- Three groups (Call on names and thresholds):
  - A notion with fewer than 2 answers is not tracked yet. Otherwise, in this order:
  - **Needs attention**: missed at least 3 of the last 6 answers.
  - **Solid**: correct the last 4 times (or every time, with fewer than 4 answers), collapsed by default.
  - **Getting steadier**: every other tracked notion (missed 1 or 2 of the last 6, and not yet 4 correct in a row).
- Each row: the notion, its Topic, the last 6 results as small marks (an icon plus a word, never color alone), "Missed 4 of last 6", "Last seen 3 days ago", and two actions: open the lesson section the notion comes from, and "Practice" which starts a Recall Quiz on that notion (Guess).
- **"Practice" and "Start a recall quiz on these"** (Call): the same kind of session as the pre-lesson Recall Quiz and the same service, but started by the learner, so it is not a gate: it can be left at any time and resumes. It uses reused questions and any new questions already stored, never waits for a Generation, and may include the most recently passed Topic (the learner chose to practice it, so the spacing rule does not apply). With too few questions it shows fewer; with none, it says there is nothing to practice yet. Same screen, same Attempt rules.
- Footnote: based on the latest 6 answers per notion; Declared Mastery and Forced Unlock never count.
- Calm tone, honey or amber for attention, sage for steadier, never red; nothing about a lost streak.

## Declared Topics without notions (Decided)

A Declared Mastery Topic may have no notions at all: its Notion Outline is generated when its Lesson is first opened, and declaring a Topic does not open it. Including such a Topic in the Recall Quiz therefore needs an outline Generation and a question Generation that nothing triggers today. The owner accepted the cost: in the background, one such declared Topic at a time, at most one per opened Lesson, so the total stays at most two Generations per opened Lesson (one batch of new questions, one declared Topic). The outline generated this way is the same one the Lesson would use later, so nothing is wasted if the learner opens that Topic afterwards. Both are Pre-generations: they wait behind foreground Generations and are cancellable.

## What the existing app already provides

- Every answer is stored (`attempts`: date, result, score, question) and tagged with the notions of the question at the time (`attempt_notions`). The last 6 answers per notion and "last seen" can be computed from this alone.
- Questions are stored (`questions`, with notion tags in `question_notions`), and a faulty question can be flagged and replaced.
- `attempts.round_id` is nullable, so an Attempt can exist outside a Round.
- The Dashboard already lists Weak Points and a Notion Map, but from the latest completed Round of each notion only.
- Mastery, Weak Points, XP, Levels, Badges, the Activity Streak and the Daily Goal are all computed from Rounds.

## What has to be built

- A new kind of session that spans several Topics (a Round is tied to one Topic and one Quiz, so a Recall Quiz is not a Round). It needs a stored identity (when, which questions, which Attempts, finished or not).
- A new Generation kind: new questions for a list of notions, each with its notions, in the Generation Language, stored in the [[Content Cache]] like the others, with the same flag-and-replace rules; and the background step that triggers it.
- Question selection (reuse, new, weights, last seen), as a pure, tested function with injected time.
- The "last 6 answers per notion" computation, as a pure function over Attempts, shared by the Recall Quiz weighting and the Memory Review.
- The Memory Review screen and the pre-lesson step of the Learning Path.
- Docs and vocabulary: see below.

## Constraints

- Recall Attempts never change mastery, Weak Points, XP, Levels, Badges, the Activity Streak or the Daily Goal (Call; the owner said a failed recall quiz has no consequence and did not ask for rewards). They must not alter the existing Round-based computations.
- The Mastery Loop, unlock rules, Forced Unlock and Declared Mastery are unchanged.
- English UI, both themes, accessible: status never by color alone, each control with a full accessible name, reduced motion respected.
- New content respects the Generation Language and the Content Cache rules. Switching the language never deletes content.
- Tests: the real Claude CLI is never called in tests (fake CLI); no real data folder.
- Older apps refuse a newer database (#69), so any migration is additive.

## Goals, non-goals, anti-goals

- **Goal:** the learner revisits old notions at spaced moments and sees which notions do not stick.
- **Non-goals:** a full spaced-repetition scheduler (no per-card intervals or ease factors, no daily review queue, no notification or reminder), flashcards, a new reward system, exporting data.
- **Anti-goals (a failure even if it works):** a Recall Quiz that makes the learner wait for a Generation; a punishing tone (red, "you forgot", streak loss); a Recall result that blocks or delays the next Lesson; a Recall result that silently changes mastery or rewards; burning the learner's CLI plan with many Generations.

## Vocabulary (to add to the glossary and `docs/concepts/` when built)

- **Recall Quiz**: the short quiz asked before a new Lesson, on earlier Lessons except the last finished one (Avoid: review, revision, refresher, flashcards).
- **Memory Review**: the screen of notions the learner finds hard to retain (Avoid: weaknesses, gaps; it is distinct from a [[Weak Point]], which is about the latest score of a completed Round).
- **Shaky Notion** (Call, name to confirm): a notion missed often in its recent answers, across Rounds and Recall Quizzes (Avoid: weakness, struggle).

## Left to the builder

The tables and columns; the exact numbers (questions per quiz, weights, thresholds of the three groups, the "last N"); the IPC shape; how Recall Attempts are linked to their session; the wording of every UI string; the prompt of the new Generation (it follows the existing quiz prompt rules and versioning); how the pre-lesson step is placed in the Learning Path.

## Suggested split into issues (not created)

1. Recall data model and the pure functions (last answers per notion, selection).
2. New-question Generation and its pre-generation trigger.
3. Recall Quiz flow before a Lesson.
4. Memory Review screen and "Practice".
5. Docs, glossary, concept notes, smoke test coverage (can ride along with each issue).
