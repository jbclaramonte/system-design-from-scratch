---
title: Ubiquitous Language
tags: [glossary, domain]
---

# Ubiquitous Language

Single source of truth for domain terms. Use these exact terms in code, schema, UI copy, issues and docs. Do not use the "Avoid" synonyms.

> [!warning] "Concept" is overloaded
> In conversation, "concept" meant both a system design subject (caching) and a domain-model element of this app. In this repo, a system design subject is a **Topic**; "concept" only refers to a note in `docs/concepts/`.

## Learning content

| Term | Definition | Avoid |
|---|---|---|
| [[Topic]] | A system design subject taught as one unit (for example Caching, Load Balancing). Maps to a primer heading. | concept, chapter, module (for a single subject) |
| [[Notion]] | A fine-grained idea inside a topic (for example cache-aside vs write-through). The unit of mastery tracking; each question targets notions. | skill, tag, sub-concept |
| [[Notion Outline]] | The ordered list of notions of a topic, generated once from its sub-topics and then fixed. | notion list, syllabus, tag list |
| [[Lesson]] | Generated text course on a topic. | course, article |
| [[Remediation Lesson]] | Short generated lesson on one missed notion, from a different angle than the original lesson. | recap, targeted course, mini-course |
| [[Lesson Question]] | A question the learner asks, in a side panel, about a passage they selected in a Lesson, a Remediation Lesson or a Protocol Step Lesson; answered by a Generation grounded on that text and its Excerpts. Kept in memory for the open panel only, never part of the Mastery Loop. Not a quiz Question. | chat, doubt, ask-AI, tutor question |
| [[Foundations Module]] | Prerequisite topics the primer assumes but does not teach (how the web works, networking basics, data storage basics...), generated ungrounded unless grounded on primer sections that are not a topic (orders of magnitude on the appendix). | module 0, basics |
| [[Diagram]] | A Mermaid schema in generated content (a ```` ```mermaid ```` block), drawn in the app, or shown as its source when it cannot be drawn. | schema, chart, figure, graph (graph is the Design Graph) |
| [[Learning Path]] | The linear, unlockable sequence: foundations, topics, design exercises. | curriculum, roadmap (roadmap is the Gantt) |
| [[Forced Unlock]] | The learner opens one locked step of the Learning Path (a topic or a Design Exercise) without mastering what comes before it. Opens that step only, with no mastery credit and no effect on the progress; stored, and undone ("Lock again") while the step has no progress. | skip ahead, bypass, override, unlock cheat |

## Assessment

| Term | Definition | Avoid |
|---|---|---|
| [[Quiz]] | A set of questions on a topic, played as one round. | test, exam |
| [[Question]] | One item in a quiz, tagged with notions. Types: single-choice, multiple-choice, scenario, free answer. | exercise (reserved for design) |
| [[Question Clarification]] | A plainer rewording, in the language of its quiz, of a quiz Question the learner does not understand, with one concrete example, shown under the Question. It clarifies the wording only: never a hint at the answer. Stored in the Content Cache per Question; no effect on the Mastery Loop. | hint (that is design practice), explanation (that is the stored answer rationale), help text |
| [[Attempt]] | One recorded answer to a question (date, question, notion, type, result). | submission, try |
| [[Round]] | One iteration of the mastery loop: quiz, grade, and possibly remediation. | turn, iteration, cycle |
| [[Mastery Loop]] | Lesson, quiz, remediation, new quiz... until the threshold is met. | learning loop, feedback loop |
| [[Mastery Threshold]] | Minimum quiz score (percent, default 100) to validate a topic. | pass mark, target score |
| [[Round Limit]] | Max rounds before the app offers another angle or a skip. | retry cap, guard rail |
| [[Declared Mastery]] | A topic the learner declared as already known ("I already know this"): it counts as mastered (it unlocks the next topic, counts for Design Exercise prerequisites and in the progress) with no Round, Attempt or score, and is marked "declared". Undone while no Round was played after it ("Undo"); tested at any time ("Test me"). | skip, self-assessment, bypass, exemption |
| [[Notion Map]] | View of mastery per notion. | skill tree |
| [[Dashboard]] | Screen with mastery, attempts and weak points. | stats page |
| [[Weak Point]] | A notion tested in a completed round whose latest score is below the current Mastery Threshold; listed on the Dashboard with why. | weakness, gap, struggle |

## Activity

| Term | Definition | Avoid |
|---|---|---|
| [[Activity Day]] | A local calendar day (it changes at local midnight) with at least one completed Round or one reviewed Protocol Step. Opening a Lesson, a Declared Mastery and a Forced Unlock never make one. | study day, active day, session |
| [[Activity Streak]] | Consecutive Activity Days ending today, or yesterday while today has none yet. One grace day: a single missed day inside a streak does not break it, at most once per 7 days. Derived from the history, never stored; no XP, no notification. | chain, combo, flame, run |
| [[Daily Goal]] | Rounds to complete per day, 1 to 3 (default 1, the `dailyGoalRounds` setting). Fills a progress bar, never decides the Activity Streak. | quota, target, daily target |

| [[XP]] | Points that grow only with mastery: a completed Round (by score, plus a bonus when passed), a Topic's first mastery, a Protocol Step passed, a Design Exercise completed. Never paid for a Declared Mastery, a Forced Unlock, reading a Lesson, asking a question or re-reading, and never twice for the same event. Derived from the history; not a currency. | points, coins, tokens, score (the Round's score is a percent) |
| [[Level]] | A named step of total XP (Novice to Architect), shown with the progress to the next one. | rank, tier, grade |
| [[Badge]] | A mark of a mastery milestone with a clear unlock rule (First Topic mastered, Foundations complete, Perfect Round, Comeback, 7-day Activity Streak, First Design Exercise completed); earned with its date or locked with its rule. | achievement, trophy, medal |

## Design practice

| Term | Definition | Avoid |
|---|---|---|
| [[Design Exercise]] | A hands-on system design problem solved on the canvas (for example URL shortener). | project, case study, lab |
| [[Interview Protocol]] | The sequence of interview steps (functional requirements, estimations, API, data model, high-level, non-functional requirements, deep dive). | framework, checklist |
| [[Protocol Step]] | One step of the interview protocol, unlocked progressively with a "why it matters" lesson. | phase, stage |
| [[Protocol Step Lesson]] | The short generated "why it matters" lesson shown the first time the learner meets a protocol step. | step intro, tutorial |
| [[Hint]] | Graded, spoiler-free help on a protocol step. | tip, clue |
| [[Reference Solution]] | The primer's solution for a design exercise, used for the final comparison. | model answer, answer key |
| [[Design Scene]] | Saved state of a design canvas for one exercise (versioned JSON of its nodes, edges and view). | drawing, board |
| [[Design Feedback]] | LLM assessment of a design, per protocol step and as a final review. | review comment, critique |
| [[Design Canvas]] | The React Flow canvas with typed components where the user draws the design. | whiteboard, diagram editor |
| [[Design Graph]] | Structured export of a design scene: nodes (typed components), edges (connections), annotations, dangling arrows, groups. What the LLM reads. | diagram JSON, scene graph |
| [[Design Export]] | What one design scene hands to the evaluation: its design graph, a text description of it and a PNG capture. | snapshot (that is the design scene), dump |

## Generation and data

| Term | Definition | Avoid |
|---|---|---|
| [[Grounding]] | Generating from bundled primer excerpts and citing the source section. Content is either grounded or ungrounded. | RAG, sourced |
| [[Source Corpus]] | The bundled primer, split by heading. | knowledge base, dataset |
| [[Excerpt]] | A passage of the source corpus returned by lookup, with a citation to its source section, passed to a generation for grounding. | snippet, chunk |
| [[Content Cache]] | SQLite store of every generated lesson, remediation lesson, quiz, Protocol Step Lesson and Question Clarification, one entry per [[Generation Language]], reused on repeat. | store, memo |
| [[Generation]] | One LLM call (via the Claude Code CLI) that produces content or grades a free answer. | completion, request |
| [[Generation Language]] | The language the course content is written in, French or English, asked once at the first launch (the first-run screen) and changeable in Settings (default French for an install that predates the question). Applies to every Generation that produces text the learner reads (Lessons, Remediation Lessons, Protocol Step Lessons, quizzes and their feedback, Design Feedback, Lesson Questions, Question Clarifications) and to the Design Exercise statements; it is part of the Content Cache key. Switching it never deletes or overwrites content of the other language and never affects mastery; a Round in progress finishes in the language of its quiz. The app UI is English whatever it is. | course language (the Settings label only), locale, i18n |
| [[Pre-generation]] | A Generation started in the background before its result is needed (for example the quiz while the lesson is read); waits behind foreground Generations, cancellable, stored in the Content Cache. | prefetch, warm-up |

## Application

| Term | Definition | Avoid |
|---|---|---|
| [[App Update]] | The app finding a newer release on GitHub and, on macOS (Apple Silicon, packaged app), replacing itself with it when the learner clicks "Install and restart"; on Linux, a banner linking to the release page. Checked at launch (once a day at most, can be turned off) and from "Check for updates" in Settings. The learner can dismiss a version ("Not now"), which is remembered. Never installs without a click, never touches the data folder or the progress. | auto-update, upgrade, self-update, patch |
| [[Theme]] | The look of the app, chosen in Settings: System (follows the operating system, the default), Light ("Warm": peach canvas, white cards, terracotta) or Dark ("Terminal Architect"). Applied at startup before the first paint, never changes content or progress. Colors carry the same meaning in both (mastered, in progress, attention, error), see [[Design System]]. | skin, appearance (the Settings group label only), color scheme, dark mode, light mode |
