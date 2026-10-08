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
| [[Lesson]] | Generated text course on a topic. | course, article |
| [[Remediation Lesson]] | Short generated lesson on one missed notion, from a different angle than the original lesson. | recap, targeted course, mini-course |
| [[Foundations Module]] | Prerequisite topics outside the primer (HTTP, DNS, basic databases), generated ungrounded. | module 0, basics |
| [[Learning Path]] | The linear, unlockable sequence: foundations, topics, design exercises. | curriculum, roadmap (roadmap is the Gantt) |

## Assessment

| Term | Definition | Avoid |
|---|---|---|
| [[Quiz]] | A set of questions on a topic, played as one round. | test, exam |
| [[Question]] | One item in a quiz, tagged with notions. Types: single-choice, multiple-choice, scenario, free answer. | exercise (reserved for design) |
| [[Attempt]] | One recorded answer to a question (date, question, notion, type, result). | submission, try |
| [[Round]] | One iteration of the mastery loop: quiz, grade, and possibly remediation. | turn, iteration, cycle |
| [[Mastery Loop]] | Lesson, quiz, remediation, new quiz... until the threshold is met. | learning loop, feedback loop |
| [[Mastery Threshold]] | Minimum quiz score (percent, default 100) to validate a topic. | pass mark, target score |
| [[Round Limit]] | Max rounds before the app offers another angle or a skip. | retry cap, guard rail |
| [[Notion Map]] | View of mastery per notion. | skill tree |
| [[Dashboard]] | Screen with mastery, attempts and weak points. | stats page |

## Design practice

| Term | Definition | Avoid |
|---|---|---|
| [[Design Exercise]] | A hands-on system design problem solved on the canvas (for example URL shortener). | project, case study, lab |
| [[Interview Protocol]] | The sequence of interview steps (functional requirements, estimations, API, data model, high-level, non-functional requirements, deep dive). | framework, checklist |
| [[Protocol Step]] | One step of the interview protocol, unlocked progressively with a "why it matters" lesson. | phase, stage |
| [[Hint]] | Graded, spoiler-free help on a protocol step. | tip, clue |
| [[Reference Solution]] | The primer's solution for a design exercise, used for the final comparison. | model answer, answer key |
| [[Design Canvas]] | The tldraw whiteboard with typed shapes where the user draws the design. | whiteboard, diagram editor |

## Generation and data

| Term | Definition | Avoid |
|---|---|---|
| [[Grounding]] | Generating from bundled primer excerpts and citing the source section. Content is either grounded or ungrounded. | RAG, sourced |
| [[Source Corpus]] | The bundled primer, split by heading. | knowledge base, dataset |
| [[Content Cache]] | SQLite store of every generated lesson, remediation lesson and quiz, reused on repeat. | store, memo |
| [[Generation]] | One LLM call (via the Claude Code CLI) that produces content or grades a free answer. | completion, request |
