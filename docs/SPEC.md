---
title: Product Spec
tags: [spec]
status: validated-by-user
---

# Product Spec: System Design Learning Desktop App

Initial spec from a scoping session. Every decision below was validated by the user, except those in [[#10. Assumptions and points to verify]]. Domain terms follow [[Ubiquitous Language]].

## 1. Vision

Personal desktop app to learn system design from scratch, built around this loop:

1. A text [[Lesson]] on a [[Topic]].
2. A [[Quiz]] on that topic.
3. On failure, a targeted [[Remediation Lesson]] on the missed [[Notion|notions]], then a new quiz, repeated until the [[Mastery Threshold]] is reached (configurable, 100% by default). See [[Mastery Loop]].
4. A [[Design Exercise]] on a canvas, with the [[Interview Protocol]] introduced progressively.

## 2. Audience and language

- Single user (personal tool). Keep the code structure clean enough to open it up later.
- Course content shown to the user is generated in French or in English, chosen at the first launch, before anything is generated, and changeable later in Settings (the [[Generation Language]], French by default for an install that predates the question). In French, technical terms stay in English (load balancer, sharding, cache, etc.) because interviews are mostly in English; in English there is no translation rule. The app UI itself is in English. See [[Prompts#Generation Language]].
- The repo itself (code, docs, issues) is in English.
- Starting level: complete beginner.

## 3. Tech stack

- Electron + React + TypeScript.
- Local SQLite (for example `better-sqlite3`). No cloud sync.
- Diagram canvas: React Flow (`@xyflow/react`, MIT). It replaced tldraw in issue #43, see [[Design Canvas Integration]].
- LLM calls: drive the Claude Code CLI as a subprocess from the Electron main process.

## 4. Content and generation

### 4.1 Source and grounding

- Content is 100% LLM-generated, [[Grounding|grounded]] on `donnemartin/system-design-primer`.
- Primer license: CC BY 4.0. Reuse allowed with attribution, a link to the license, and a notice of modifications. An About screen carries these.
- The primer is bundled and split by Markdown heading (`##` topics, `###` sub-topics). For each generation the LLM receives the relevant excerpts and cites the source section.
- Third-party content linked from "Source(s) and further reading" is not covered by the license and is not bundled.
- `ashishps1/awesome-system-design-resources` (GPL-3.0) is not bundled. At most an inspiration source for design ideas; it only contains links and a few Java/Python implementations.

### 4.2 Foundations Module

- Covers prerequisites absent from the primer: client/server, HTTP, DNS, basic databases, etc.
- Generated from the model's own knowledge, ungrounded, and flagged "outside primer" in the UI so the reliability difference is visible.
- All later modules are grounded on the primer.

### 4.3 Generation strategy (latency)

- [[Lesson|Lessons]] are streamed.
- While a lesson is being read, the matching quiz is pre-generated in the background.
- All generated content (lessons, remediation lessons, quizzes) is stored in the [[Content Cache]] (SQLite) and reused when a topic is redone.

### 4.4 Diagrams

Lessons, remediation lessons, protocol step lessons and scenario questions include Mermaid diagrams written by the LLM (flowchart, sequence diagram, etc.), rendered in the app in strict mode with a text alternative. An invalid diagram falls back to a code block and never breaks the content. Diagrams only show what the excerpts support (ungrounded content is flagged as usual).

### 4.5 Learning aids

Small helpers around the text and the quiz, outside the mastery loop: they never count in a score, a round or a topic status.

- **Lesson Question** (#52): select a passage of a [[Lesson]], a [[Remediation Lesson]] or a [[Protocol Step Lesson]], click Ask, and a panel on the right quotes it and answers in French, grounded on the text and the topic's excerpts ([[Lesson Question]]). The thread of follow-ups is kept in memory only. Not offered while a quiz round is open.
- **Question Clarification** (#53): each [[Question]] of a quiz has an "I don't understand the question" button that shows a plainer French rewording and one concrete example, without ever hinting at the answer, and the question stays as it is ([[Question Clarification]]). Stored in the [[Content Cache]] per question; "Reformulate differently" asks for another version.

## 5. Mastery loop

- Each [[Question]] is tagged with one or more notions.
- After a failed quiz:
  1. The LLM generates a remediation lesson per missed notion, from a different angle than the original explanation.
  2. A new quiz is composed of fresh questions on those notions, plus a reminder of already mastered ones.
  3. The loop continues until the threshold is reached.
- Settings:
  - Course language (French or English), for the content generated from then on. Content already generated is kept in its language, mastery never depends on it, and a round in progress finishes in the language of its quiz. See [[Generation Language]].
  - Global mastery threshold in percent, adjustable, 100% by default.
  - [[Daily Goal]]: Rounds per day, 1 to 3, 1 by default.
  - Guard rail: after N rounds without success (N adjustable), the app offers another angle (concrete example, analogy) or to skip and come back later. See [[Round Limit]].
- Question types:
  - Single-choice (MCQ).
  - Multiple-choice (multi-answer).
  - Scenario / trade-off choice.
  - Short free answer, graded by the LLM.
- The first three are graded locally, with no LLM call. Free answers go through the LLM.

## 6. Design exercise

### 6.1 Canvas

- Embedded React Flow editor (nodes and edges, no license key).
- Library of typed components (load balancer, cache, DB, queue, etc.) so the graph can be analyzed reliably.
- For evaluation the LLM receives:
  - a structured JSON export (components, links, labels, annotations);
  - a PNG capture for visual context.

### 6.2 Staged interview protocol

The protocol is unlocked progressively from one design to the next. On first encounter of each step, a short "why it matters" lesson explains its purpose.

| Design | Active steps |
|---|---|
| 1 | Functional requirements + high-level design |
| following | Progressive additions: estimations, then API and data model, then non-functional requirements, then deep dive |

The exact order of additions from design 2 onwards is still to be refined while designing the content.

### 6.3 Feedback

- Each unlocked step is submitted and validated with LLM feedback: gaps, errors, forgotten trade-offs.
- A "hint" button gives graded hints without spoilers.
- A final review compares the design to the primer's [[Reference Solution]].
- Starting catalogue: the primer's 8 solutions (pastebin, twitter, web crawler, mint, social graph, query cache, sales rank, scaling AWS). Extra designs can be LLM-generated, ungrounded, and would be flagged as such.

## 7. Path and navigation

- Linear [[Learning Path]]: foundations, topics, then designs. Each step is unlocked by mastering the previous one.
- [[Notion Map]] and [[Dashboard]]: mastery per notion, attempt history, weak points.
- [[XP]], [[Level]] and [[Badge]]s **reward mastery only**: a completed Round, a Topic's first mastery, a passed Protocol Step and a completed Design Exercise pay XP; a Declared Mastery, a Forced Unlock, reading a Lesson, asking a question and re-reading pay nothing, and the same event never pays twice. No tokens, no currency, no leaderboard, no notification. The Level and XP show in the Learning Path side panel and the Dashboard, the Badges (earned with date, locked with their rule) on the Dashboard, and the XP of a Round with its reason on its results screen. All derived from the history; see [[Rewards Implementation]].
- [[Celebration]]s: a passed Round makes the XP total of its results tick up with a soft glow; a [[Badge]] earned or a [[Level]] reached slides a card in at the corner, one at a time, in order, dismissible and gone by itself. CSS only, no sound, never blocking, plays once per unlock, never for a failed Round and never for what was earned before the first launch with the feature. Nothing red; unlocks are announced politely to screen readers; with reduced motion the same content shows still; the "Celebrations" setting (default on) turns the animation off while the XP line and the Badges stay. See [[Rewards Implementation#Celebrations]].
- [[Activity Streak]] and [[Daily Goal]]: a "Streak" card on the Learning Path and the Dashboard overview with the week strip (Monday to Sunday) and today's progress. An [[Activity Day]] is a local calendar day with a completed Round or a reviewed Protocol Step; one grace day per 7 days keeps a streak alive; the Daily Goal is 1 to 3 Rounds a day (Settings, default 1). Derived from existing data, no XP, no notification, no sound, and a fresh install says "Start your streak" with nothing red.

## 8. Data

Local SQLite. Everything is recorded:

- generated lessons, remediation lessons and quizzes ([[Content Cache]]);
- every [[Attempt]]: date, question, notion, type, result;
- design scenes (React Flow nodes and edges as JSON) and design feedback;
- progress and settings (threshold, N rounds, Daily Goal).

The [[Activity Streak]], [[XP]], [[Level]] and [[Badge]]s are not stored: they are computed from the completed Rounds, the reviewed Protocol Step submissions and the final reviews of Design Exercises. Only the Badges already celebrated and the Level celebrated so far are remembered (the baseline and the celebrations, see [[Celebration]]).

Spaced repetition is out of the MVP, but the attempt model must allow it without a migration.

## 9. Scope

### MVP

- Foundations Module.
- Primer topics: scalability, performance vs scalability, latency vs throughput, CAP and consistency, load balancing, cache, databases (SQL/NoSQL, replication, sharding), queues / asynchronism.
- Full mastery loop with the four question types.
- At least two designs with the staged protocol and the Design Canvas.
- Basic dashboard.

### Out of MVP

- Spaced repetition and a "review today" queue.
- Multi-machine sync.
- Distribution to other users (LLM provider abstraction, API key, i18n).
- The remaining ~30 primer topics.

## 10. Assumptions and points to verify

- **tldraw license** (history): tldraw needs a license key in production; this pushed the Design Canvas to React Flow (MIT, issue #43, [[react-flow|spike]]).
- **Claude Code CLI dependency**: acceptable for personal use. Distribution later requires a provider abstraction layer (API key).
- **CLI latency**: several seconds per call. Measure early in a prototype; may force more pre-generation.
- **Design catalogue**: only 8 primer-grounded solutions. Anything generated beyond that is ungrounded.
- **Generated quiz quality**: grounding reduces but does not remove the risk of wrong questions. Provide a way to flag a faulty question and regenerate it.
- **Free answer grading**: LLM grading is less deterministic. Behavior for a contested grade is to be defined.

## 11. Sources

- https://github.com/donnemartin/system-design-primer (CC BY 4.0): grounding source.
- https://github.com/ashishps1/awesome-system-design-resources (GPL-3.0): inspiration only, nothing bundled.
