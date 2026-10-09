---
title: Foundations Module Content
tags: [learning-content, generation, prompts]
issue: 16
---

# Foundations Module Content

What the [[Foundations Module]] teaches, why, how its ungrounded content is kept honest, and how one topic is grounded on the primer appendix. Code: `src/main/content/foundations.ts` (the topic list), `seedTopics` (`src/main/content/topics.ts`), the ungrounded prompt rules in `src/main/generation/prompts/` (see [[Prompts]]).

## Topics

Six [[Topic|Topics]], seeded first in the [[Learning Path]] (positions 0 to 5; primer topics start at `CORPUS_TOPIC_POSITION_OFFSET` = 1000). Slugs are stable: [[Notion|notions]] and [[Attempt|attempts]] hang off the topic row.

| # | Slug | French title | Covers | Leaves to the primer |
|---|---|---|---|---|
| 1 | `how-the-web-works` | Comment fonctionne le web : client, serveur et HTTP | client/server, request and response, URL parts, HTTP methods, status code families, headers and body, statelessness and cookies, JSON | DNS (`domain-name-system`), REST vs RPC (`communication`), CDN, load balancer, reverse proxy |
| 2 | `networking-basics` | Les bases du réseau : adresses IP, ports, TCP et UDP | IP addresses, names translated to addresses, ports, packets, TCP vs UDP as a mental model, round trip and distance | how DNS works, the detailed TCP/UDP/HTTP comparison (`communication`), `latency-vs-throughput` |
| 3 | `inside-a-server` | Dans un serveur : CPU, mémoire, processus et threads | CPU, RAM vs disk, processes and threads, concurrency vs parallelism, shared state and race conditions, the limits of one machine | vertical/horizontal scaling (`performance-vs-scalability`, `load-balancer`), queues (`asynchronism`) |
| 4 | `data-storage-basics` | Stocker des données : tables, index et transactions | why a database, tables/rows/columns/primary keys, simple SQL, indexes (faster reads, slower writes), transactions as all-or-nothing, key-value as the simplest model | ACID in depth, replication, federation, sharding, denormalization, NoSQL families (`database`), `cache` |
| 5 | `orders-of-magnitude` (**grounded** on the primer appendix) | Ordres de grandeur : unités, puissances de deux et latences | what back-of-the-envelope estimates are for, bytes and KB to TB with the powers of two behind them, ns/µs/ms, the latency numbers (memory, SSD, HDD, network in a data center and across the world) as orders of magnitude, how many times slower, the handy throughput metrics, a step-by-step estimate | CPU-level rows of the latency table (L1/L2 cache, branch mispredict, mutex), estimations in a [[Design Exercise]] ([[Interview Protocol]]) |
| 6 | `failures-and-redundancy` | Pannes, redondance et disponibilité | everything fails, single point of failure, redundancy, backups vs redundancy, availability as a percentage of time, health checks and monitoring | fail-over, replication and the nines table (`availability-patterns`), consistency trade-offs |

### Why these six

- **What the primer assumes.** The primer opens on scalability and immediately talks about requests, servers, databases, latency and failures. A complete beginner (the [[SPEC]] audience) needs those words first; each topic above answers "what is this thing the primer keeps mentioning".
- **No overlap with grounded topics.** The spec's examples (HTTP, DNS, basic databases) are partly in the primer: DNS is `domain-name-system`, HTTP/TCP/UDP/REST are in `communication`, ACID and SQL vs NoSQL in `database`, the nines in `availability-patterns`. Those stay grounded. The foundations only teach the layer below (what a request is, what an index is, what availability means) and each seed lists what it leaves to the primer, which the [[Notion Outline]] prompt is told to leave out. DNS is therefore not a foundations topic; `networking-basics` only says that names are translated to addresses.
- **Gaps the primer leaves.** The appendix (powers of two, latency numbers) and the interview method (back-of-the-envelope) are not teachable topics ([[Corpus#Teachable topics]]), so nothing teaches estimation basics: `orders-of-magnitude` does, grounded on those appendix sections (see [[#Grounded foundations]]). Nothing explains processes, threads and the limits of one machine either: `inside-a-server` does.
- **Order.** From the outside in: the web as the learner sees it, the network underneath, the machine that answers, where it keeps data, then numbers to reason about all of it, and finally what happens when parts fail (which needs every earlier topic).
- **Six, not more.** Each is one [[Lesson]] of 4 to 8 notions. Security basics and operating-system details were left out: the primer's `security` topic is short and grounded, and OS internals are not needed to read the primer.

## Seeding

`FOUNDATIONS_TOPICS` (`src/main/content/foundations.ts`) is passed to `seedTopics` at startup (`src/main/index.ts`). Insert-only and idempotent like the primer topics: an existing slug is left as it is, a new foundations topic is inserted at its index. Rows get `in_foundations_module = 1` and no `source_section`. A slug that clashes with a primer topic id throws at startup. Each seed also carries `scope` and `leftToPrimer` (English, prompt text, not stored), read back by slug when a prompt is built (`topicBrief` in `src/main/generation/pipelines.ts`), and optionally `groundedOn`, the primer section ids it is grounded on (`foundationsGroundedOn`).

## Grounded foundations

A seed may declare `groundedOn`: primer section ids, exact sections (a topic id does not pull its sub-topics), even sections of non-teachable topics, which stay usable as [[Excerpt|Excerpts]] through the corpus lookup although they are never seeded as topics ([[Corpus#Teachable topics]]). The rule is generic; today only `orders-of-magnitude` declares it:

- `appendix` (the intro on back-of-the-envelope estimates), `appendix/powers-of-two-table`, `appendix/latency-numbers-every-programmer-should-know` (the table, the time units and the handy metrics).

For such a topic `topicGrounding` returns exactly those excerpts with the primer commit as corpus version (an unknown id throws), so the [[Notion Outline]] cites them (every `appendix/...` sub-section covered by a notion, the seed's `scope` and `leftToPrimer` still in the prompt), the [[Lesson]] and the [[Quiz]] get the grounded rules and citations, a [[Remediation Lesson]] gets its notion's sections, and `regenerateQuestion` follows the stored quiz's `grounded` flag as before. Every row is `grounded = 1` with its `sourceSections`; `TopicSummary.grounded` is true, so the topic shows the "System Design Primer" badge, not **Outside the primer**. Its scope was narrowed to what the appendix supports: the grounded rules forbid facts outside the excerpts.

Why: the appendix tables are exactly the numbers this topic teaches, and the primer gives them; generating them ungrounded threw that source away and made the numbers the least checkable part of the module.

## Same flow, ungrounded

The other five topics declare no `groundedOn`. Every content path picks the ungrounded variant for them: `topicGrounding` returns no [[Excerpt|excerpts]] for the [[Notion Outline]], [[Lesson]] and [[Quiz]]; the outline has empty `sourceSections`, so `notionGrounding` gives none to a [[Remediation Lesson]] either; `regenerateQuestion` follows the stored quiz's `grounded` flag. Every Generation output, `lessons`, `quizzes` and `remediation_lessons` row is `grounded = 0`, `sourceSections = []`. Proven end to end in `src/main/content/foundations.test.ts` (outline, lesson, Pre-generated quiz, failed [[Round]], Remediation Lesson, targeted round, regenerated question; no prompt carries an excerpt; plus a lesson and a Remediation Lesson through the fake CLI). The same file runs that flow for `orders-of-magnitude` on the bundled primer: every prompt carries `appendix/...` excerpts and never `UNGROUNDED_RULES`, and every row is grounded.

The UI flags ungrounded topics (`TopicSummary.grounded` false) with the **Outside the primer** badge (`OutsidePrimerBadge`, `src/renderer/src/lesson/`): topic lists (Lessons and Learn), the lesson header, the topic screen header of the [[Mastery Loop]] (shown during the quiz, results and Remediation Lessons), and the quiz results.

## How ungrounded generation is guarded

Ungrounded content has no excerpt to stay within and no citation to check. `UNGROUNDED_RULES` (`prompts/common.ts`), in every ungrounded lesson, quiz and Remediation Lesson prompt:

- standard basics that any introductory course teaches the same way; leave out what is uncertain, vendor-specific, recent or disputed;
- exact numbers only for definitions and fixed conventions (8 bits, 1024, 86,400 s, 404, port 443); measured quantities (latency, throughput, failure rates) only as rough orders of magnitude with "environ" or "de l'ordre de", saying they depend on hardware and change over time; no invented figure, statistic or benchmark;
- say "en simplifiant" when simplifying; say what a choice depends on rather than stating one universal rule;
- no references at all: no `[source: ...]`, books, studies, RFC numbers, URLs or quotes.

On top of that, the ungrounded quiz prompt requires answer keys built on basic facts the lesson teaches, never on a precise measured number, and asks to rewrite any choice that could be argued correct in some situation. The ungrounded outline prompt gets the topic's scope and what to leave to the primer, and forbids notions resting on a precise number or a vendor detail. Prompt versions were bumped (`notion-outline-3`, `lesson-2`, `quiz-3`, `remediation-lesson-3`; current versions in [[Prompts#Versions]]).

What is **not** guarded: nothing checks facts after generation. The badge tells the learner; the faulty-question flag and regeneration exist in the main process (`flagQuestion`, `regenerateQuestion`) but have no UI yet.

## Quality review (2026-10-09, sonnet, effort low)

`node scripts/prompt-quality-check.ts <slug> <output.md> --skip-remediation --max-calls=3` on two topics, 6 real CLI calls, no retry. Samples: [[samples/foundations-how-the-web-works|how-the-web-works]] (outline 8 s, lesson 36 s / 4.9k tokens, quiz 16 s) and [[samples/foundations-orders-of-magnitude|orders-of-magnitude]] (6 s, 32 s / 4.5k tokens, 21 s). Remediation Lessons were not run. Both samples predate the grounding of `orders-of-magnitude` and the narrowed language rule: they show the ungrounded variant.

What works:

- Structure followed exactly: markers in outline order, recap, no citation, every notion quizzed (8/8, 7/7), every type used. The outlines match the seeded scope and stay off the primer topics (no DNS mechanics, no REST vs RPC, no nines).
- The number rules worked: latencies are given as orders of magnitude with an explicit "they depend on hardware" caveat (memory about 100 ns, SSD tens to hundreds of µs, HDD a few ms, a distant network call tens to hundreds of ms), the peak factor (2 to 5 times the average) is framed as a rule to adapt, and exact numbers are only conventions or arithmetic. All the arithmetic I checked is right (10M/86,400 ≈ 116; rounding is 14 % low; 2^40/10^12 ≈ +10 %; 10 TB/day × 400 ≈ 4 PB).
- Simplifications are flagged ("en simplifiant": the server cannot push data, HTTP is stateless), and caveats are standard (GET is safe by convention only, PUT usually replaces, other methods exist).
- Answer keys are correct and answerable from the lessons.

Weaknesses and errors spotted:

- **No outright factual error found**, but two contestable simplifications in `orders-of-magnitude`: "les tailles reposent sur les puissances de deux" and "on a adopté les préfixes kilo, méga, giga" because 1024 ≈ 1000 skip the decimal (SI, used by disk makers and network speeds) versus binary (KiB, MiB) distinction; Q3 tests that simplified "why". A learner will meet both conventions.
- **Franglais from the language rule**: "server", "request", "response", "memory", "disk", "network" stay in English inside French sentences ("la memory est bien plus rapide que le disk local", "le server renvoie une response"). The topic title says "serveur" while the lesson says "server". "Byte" is used without "octet"/"Mo"/"Go", which is what a French learner sees daily. The rule "keep technical terms in English" is too broad for everyday computing words; it should be scoped to system design jargon. **Addressed** (2026-10-09): `LANGUAGE_RULES` now keeps only system design jargon in English and asks for French everyday words (serveur, requête, mémoire, disque, réseau, octet, Mo/Go) with good and bad examples; `UNGROUNDED_RULES` says "1 octet = 8 bits"; every prompt version was bumped. Not re-run against the real CLI yet.
- **Length**: 2059 and 1800 words, 8 and 7 notions; long for a first lesson of a complete beginner.
- **Easy questions**: several are recall (bits in a byte, unit order, which part is the query string); the 404 scenario gives the answer away ("un produit qui n'existe pas"). Some free answers ask two or three things at once.
- One run per topic: no statistics. The other four topics and the ungrounded Remediation Lesson were not run for real.

## Verification (2026-10-09)

- `npm run lint`, `typecheck`, `test`, `build` pass; `format:check` passes on the files of this change.
- Built app over the Chrome DevTools protocol, scratch `--user-data-dir`, `CLAUDE_CLI_PATH` set to a deterministic fake CLI: startup log "Seeded 21 topics" (6 foundations + 15 primer); the home screen lists the six foundations first, each with **Outside the primer**; `how-the-web-works` opened with the badge in the topic screen header and the lesson header; round 1 played (83.3 %) with the badge on the quiz results; the Remediation Lesson step kept the header badge. Every outline, lesson, quiz and Remediation Lesson prompt received by the fake had "Foundations Module" and no `<excerpt`; the database rows had `grounded = 0` and empty `source_sections`.

## Related

- [[Foundations Module]], [[Grounding]], [[Learning Path]], [[Topic]]
- [[Prompts]], [[Lesson View]], [[Mastery Loop Implementation]]
