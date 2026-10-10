---
title: Prompts
tags: [generation, prompts]
issue: 7
---

# Prompts

The prompts and output schemas behind every content [[Generation]]: [[Notion Outline]], [[Lesson]], [[Quiz]] and [[Remediation Lesson]], plus free-answer grading (#10). Code: `src/main/generation/prompts/` (pure builders) and `src/main/generation/pipelines.ts` (load from the database and the [[Source Corpus]], persist). They run through the [[Generation Service]]. The [[Design Feedback]] prompts (step feedback, [[Hint]]s, final review) and the [[Protocol Step Lesson]] prompt (#14) are described in [[Interview Protocol Implementation#Generations]]. The generic `generation:start` IPC round trip (dev panel) still uses `placeholderPrompts.ts`.

## Shared rules

Every builder returns `{ kind, input, prompt: { version, system, user }, schema?, groundedSourceSections }`, ready for `service.generate` or `service.pregenerate`. Instructions are written in English; the output is French.

- **Language** (`LANGUAGE_RULES`, included verbatim in every prompt, tested in `prompts.test.ts`): French for everything the learner reads, addressing the learner as "tu". Only system design jargon stays in English (load balancer, sharding, cache, replication, throughput, latency, TTL...), with an optional French gloss on first use; everyday computing words are French (serveur, client, requête, réponse, mémoire, disque, réseau, base de données, octet with Ko/Mo/Go/To). The rule carries good and bad examples ("le serveur renvoie une réponse", not "le server renvoie une response"; "un load balancer", not "un répartiteur de charge"; "10 Go", not "10 GB"). No English sentences.
- **Audience**: complete beginner who knows basic programming. Define every term on first use, short sentences, one concrete example per abstract idea.
- **[[Grounding]]**: only facts of the excerpts; analogies and examples allowed, new technical claims not. Text outputs cite inline as `[source: <section id>]` (one id per bracket, ids copied from the excerpt list); `findCitations` and `unknownCitations` in `prompts/common.ts` parse them. Quizzes put the ids in `sourceSections` instead.
- **Ungrounded variant** ([[Foundations Module]] topics that declare no `groundedOn` sections): no excerpts, the conservative `UNGROUNDED_RULES` (textbook basics only, exact numbers only for definitions and conventions, measured quantities as hedged orders of magnitude, "en simplifiant" when simplifying, no references of any kind; quizzes: answer keys never resting on a precise measured number; outlines: the topic's `scope` and what to leave to the primer), see [[Foundations Module Content]], `groundedSourceSections: []`, so the Generation output has `grounded: false` and `sourceSections: []`. Schemas then require empty `sourceSections`. A Foundations Module topic whose seed declares `groundedOn` sections (`orders-of-magnitude`, on the primer appendix) uses the grounded variants instead, see [[Foundations Module Content#Grounded foundations]].
- **[[Excerpt|Excerpts]]**: a topic's section and its sub-topics (`findExcerpts({ sectionIds: [topic] })`), a notion's own sections for a remediation lesson. `assembleExcerpts` strips HTML images and link targets, drops empty sections, keeps excerpts in corpus order within a token budget (outline 6000, lesson 8000, quiz 8000, remediation 3000 tokens; every MVP topic fits), and wraps each in `<excerpt id="..." title="...">`.
- **Cache input**: `input` holds what the output depends on besides the prompt text: topic, notions, options, the excerpt ids and the corpus commit (`ungrounded` for foundations), the lesson as a SHA-256 for a quiz. With `prompt.version` it forms the [[Content Cache]] key.

## Versions

Bump the constant with any change to the prompt text or schema: it is part of the Content Cache key, so cached lessons, quizzes, Remediation Lessons and Protocol Step Lessons of an older version are never reused (they stay in `content_cache` but no key points to them anymore). Notion Outlines are not affected: they live in `notions` and are never regenerated. The narrowed language rule (2026-10-09) bumped every version below.

| Constant | Version | File |
|---|---|---|
| `NOTION_OUTLINE_PROMPT_VERSION` | `notion-outline-4` | `prompts/notionOutline.ts` |
| `LESSON_PROMPT_VERSION` | `lesson-4` | `prompts/lesson.ts` |
| `QUIZ_PROMPT_VERSION` | `quiz-7` | `prompts/quiz.ts` |
| `REMEDIATION_LESSON_PROMPT_VERSION` | `remediation-lesson-5` | `prompts/remediationLesson.ts` |
| `FREE_ANSWER_GRADING_PROMPT_VERSION` | `free-answer-grading-2` | `prompts/freeAnswerGrading.ts` |
| `PROTOCOL_STEP_LESSON_PROMPT_VERSION` | `protocol-step-lesson-3` | `prompts/protocolStepLesson.ts` |
| `DESIGN_STEP_FEEDBACK_PROMPT_VERSION` | `design-step-feedback-4` | `prompts/designFeedback.ts` |
| `DESIGN_HINT_PROMPT_VERSION` | `design-hint-3` | `prompts/designFeedback.ts` |
| `DESIGN_FINAL_REVIEW_PROMPT_VERSION` | `design-final-review-4` | `prompts/designFeedback.ts` |

`lesson-4`, `remediation-lesson-5` and `protocol-step-lesson-3` (#23) add the diagram rules: cached lessons, Remediation Lessons and Protocol Step Lessons of older versions are regenerated on next use (with diagrams). The diagram repair prompt has its own constant, `DIAGRAM_REPAIR_PROMPT_VERSION` = `diagram-repair-2` (`src/main/generation/diagrams.ts`; 2 added the parser errors and the quoting fix); it is not part of any cache key, since the repair result is stored inside the content it repairs.

Free-answer grading is never cached; its version is stored in each Attempt's grading record instead, so a grade can be traced to the prompt that gave it. Design Feedback is never cached either; its version is stored in each `design_feedback` row (`promptVersion`).

Design Feedback history: version 3 (#15) names the exercise's active steps and gets only the Reference Solution parts of the steps judged; step feedback 4 and final review 4 (#15, leak iteration) point at the category of missing content, never at a reference item the learner did not write, and the final review prefixes each gap with the reference part it draws from. Step feedback is also checked by a leak guard in code, see [[Interview Protocol Implementation#Leak guard]].

## Notion Outline

How a topic gets its [[Notion|notions]]: one structured Generation (kind `notion_outline`) seeded by the topic's `###` sub-topics, run by `ensureNotionOutline` the first time a lesson or quiz of the topic is prepared, stored in `notions` (with `source_sections`) and reused forever.

```ts
{ notions: Array<{ slug: string /* kebab-case, English */, title: string /* French */,
  description: string /* one French sentence */, sourceSections: string[] /* excerpt ids */ }> }
// 3 to 8 notions (the prompt asks 4 to 8), unique slugs, every sub-topic cited at least once
```

The prompt asks to split a sub-topic holding several distinct ideas (strategies with their own trade-off) and to merge sub-topics too thin to be tested alone, in teaching order.

> [!note] Why the `notions` table is the outline's cache
> Notion ids are referenced by question tags and [[Attempt|attempts]]; regenerating an outline would orphan the mastery history. So an outline is generated once per topic and is **not** in `content_cache` (whose cache key changes with every prompt version bump). Concurrent calls for one topic share one Generation. Changing an existing outline is a deliberate data migration, not a cache miss.

## Lesson

`buildLessonGeneration(topic, notions, grounding)`, streamed Markdown, no schema:

1. `# <French topic title>` and a 3 to 5 sentence introduction with an everyday analogy.
2. Per notion, in outline order: `## <notion title>`, the marker line `<!-- notion: <slug> -->` (hidden when rendered, parsed by `findNotionMarkers`), then what it is, how it works, when to use it, its trade-off; 150 to 250 words.
3. `## Récapitulatif`: one bullet per notion, `- **<title>** : <one sentence>`.

## Quiz

`buildQuizGeneration(topic, notions, grounding, options)`, structured. Options: `count` (default `max(6, number of targeted notions)`, so every targeted notion gets at least one question), `types` (default all four), `focusNotions` and `reminderNotions` ([[Mastery Loop]] rounds: fresh questions on missed notions plus 1 to `min(2, max(1, floor(count / 3)))` mandatory reminder questions tagged only with already acquired notions, prompt version `quiz-2`; only those notions can be tagged), `avoidPrompts` (earlier questions, never repeated), `lessonMarkdown` (questions must be answerable from it), `replaces` (flagged question and reason, see below).

```ts
{ questions: Array<
  | { type: 'single_choice' | 'multiple_choice', prompt, notions, sourceSections,
      diagram?: string /* Mermaid, #24 */,
      choices: Array<{ text: string, correct: boolean }> /* 3 to 5 */, explanation: string }
  | { type: 'scenario', prompt, scenario: string, diagram?: string, notions, sourceSections, choices, explanation }
  | { type: 'free_answer', prompt, notions, sourceSections,
      expectedPoints: string[] /* 1 to 4, rubric for #10 */, modelAnswer: string }
> }
```

`notions` and `sourceSections` are JSON-schema enums of the allowed slugs and excerpt ids, so the CLI constrains them. The Zod refinements (fed back to the model on the automatic retry) reject: exactly-one-correct violated for `single_choice` and `scenario`; fewer than 2 correct or no wrong choice for `multiple_choice`; duplicate choices, prompts or tags; a prompt from `avoidPrompts`; a missing type when `count` allows every type; fewer than `min(target notions, count)` target notions covered; too few or too many reminder questions in a targeted round; a `diagram` that `checkDiagramSource` refuses, has more than 10 nodes, or contains the text of a correct choice or a word such as "correct" / "bonne réponse" (`quizDiagramError`, see [[Quiz Engine#Quiz Diagrams (#24)]]). Each `choices` item carries its own `correct` flag rather than an index, which avoids off-by-one answer keys. `saveQuiz` stores a result: `questions.prompt`, `questions.body` = the rest minus `type` and `notions` (tags go to `question_notions`), so a `diagram` is stored in the body.

**Diagrams (`quiz-5` to `quiz-7`, #24)**: `QUIZ_DIAGRAM_RULES`, in the prompt whenever a choice type is allowed (so also in a regenerated question and in targeted rounds, whose reminder logic is unchanged). Every `scenario` whose situation involves components or a request flow gets a `diagram` of that situation; optional on `single_choice` / `multiple_choice`, never on `free_answer`. The Diagram shows the situation, not the answer (no correct-choice text, no "correct" or "bonne réponse", no hint on the component in question; a correct choice that is a component name is left out of the drawing; for a "which strategy" question, only what exists before the choice, never the flow of one of the choices, `quiz-7`), only components and flows the question or the lesson state, `flowchart` or `sequenceDiagram`, at most 8 nodes, plain-text labels. The rules are quiz-specific and written in `quiz.ts` rather than reusing the lesson `DIAGRAM_RULES` (#23): a JSON field, not a fenced block, smaller, and the answer-leak rule. The version bump changes the [[Content Cache]] key, so quizzes cached under `quiz-4` (pre-generated ones included) are not reused; stored quizzes are untouched. `quiz-6` also states the notion coverage the schema already enforced ("Tag every notion listed on at least one question (all N, this is checked)" when the quiz has room, else "at least `count` different notions"): the vaguer "cover as many notions as possible" made a real run miss one notion and pay an automatic retry. Iterate with `node scripts/quiz-diagrams-check.ts [--max-calls=N] [--dry-run]` (one cache quiz from [[samples/cache|the cache sample]]'s outline and lesson; `--dry-run` prints prompt and JSON schema sizes; each call's raw stream is summarized: blocks, stop reason, turns, durations, usage, refusal reasons). Real-run review: [[Quiz Engine#Quiz Diagrams quality review]].

## Remediation Lesson

`buildRemediationLessonGeneration(topic, notion, grounding, { angle, missedQuestionPrompts?, usedAngles? })`, streamed Markdown on ONE notion, grounded on that notion's sections only. Angles: `concrete_example` (one realistic scenario followed step by step with numbers), `analogy` (one non-computer analogy, mapped back element by element, with where it breaks), `contrast` (side by side with what the notion is confused with) or `guided_questions` (4 to 6 short questions answered right away). `usedAngles` lists the angles the learner already read on the notion: the prompt asks for a clearly different style, example and situation. The [[Mastery Loop]] picks the next unused angle per notion ([[Mastery Loop Implementation]]); `remediation-lesson-2` added the last two angles and `usedAngles`. It must not open with the textbook definition, addresses the misunderstanding the missed questions reveal without answering them, 200 to 350 words, `## <notion title>` then `**À retenir**` with 2 or 3 bullets.

## Diagrams

Lessons, Remediation Lessons and Protocol Step Lessons ask for [[Mermaid Diagrams]] (#23).

- **`DIAGRAM_RULES`** (`prompts/common.ts`, in the system prompt of the three builders, exported for other prompts): ```` ```mermaid ```` fences; supported types only (flowchart LR/TD for architecture and data flow, sequenceDiagram for request flows, stateDiagram-v2, erDiagram, classDiagram as a last resort); at most about 12 nodes, one idea per diagram, labels of 1 to 4 words following the language rules; plain text only (no HTML, `<br>`, Markdown, emojis, click, `%%{init}%%`, style, classDef, class, linkStyle, front matter); short ASCII node ids, double-quoted labels when they hold punctuation; every arrow carrying data labelled; the diagram shows only what the text says and follows the same [[Grounding]] rules (ungrounded topics keep `UNGROUNDED_RULES`). Two valid examples (a load balancer flowchart, a cache miss sequence) are included; a test checks they pass `checkDiagramSource`.
- **`diagramPlacementRules({ min, max, when })`** in the user prompt: lessons 1 to 3 (architecture, request flow, data flow, failure scenario), Remediation Lessons at most 1 (only if it makes the missed notion clearer from the chosen angle), Protocol Step Lessons at most 2 (for example a typical high-level design of the running example; none for list steps). Each diagram right after the paragraph it illustrates, introduced by one sentence.
- **Repair** (`src/main/generation/diagrams.ts`, the builders' `finalize: repairDiagrams` hook, run by the [[Generation Service]] after a valid output and before the [[Content Cache]] write and the `done` event): `validateDiagramsInMarkdown` runs `parseDiagramSource` on each top-level block: `checkDiagramSource`, then mermaid's own parser in the main process (catches bad syntax such as unquoted parentheses in a flowchart label; see [[Mermaid Diagrams#Parser in the main process]]). If some fail, ONE structured call (`buildDiagramRepairCall`: the broken sources, their error codes and messages (the parser's message for a `parse_error`, at most 200 characters) and lead-in paragraphs, schema `{ diagrams: [{ id, source }] }`, 90 s timeout, same CLI settings and signal as the Generation, no retry, not cached) returns corrected sources; each one that passes the same validation (parser included) replaces its block. Blocks still invalid (or a failed repair call) stay as written, the renderer falls back to a code block, and a hidden `<!-- diagram-invalid: <n> <code> -->` line is appended (`findDiagramFailures`), so a regeneration can be offered later. Cancellation during the repair cancels the Generation. No new Generation kind and no migration.
- The streamed text is the unrepaired one; the renderer's reducer replaces it with `done`'s content, so the learner ends up on the repaired text ([[Lesson View]]).

## Free-answer grading

`buildFreeAnswerGradingGeneration({ question: { prompt, expectedPoints, modelAnswer }, notions, answer, contest? })`, structured, kind `free_answer_grading`, ungrounded (`groundedSourceSections: []`: the rubric of the question is the reference, which keeps the call small). Called by `createFreeAnswerGrader` (`src/main/quiz/freeAnswerGrader.ts`) with priority `foreground` and a 90 s timeout; rules of use in [[Quiz Engine#Free answers (#10)]].

```ts
{ verdict: 'correct' | 'partially_correct' | 'incorrect',
  expectedPoints: Array<{ covered: boolean, justification: string /* one sentence */ }>, // one per expected point, in order
  misconceptions: string[] /* at most 3 */, explanation: string /* 2 to 4 sentences */,
  toReview: string[] /* 1 to 3, empty only when correct */ }
```

- **Untrusted text**: the learner's answer is wrapped in `<learner_answer>` ... `</learner_answer>` (a contest justification in `<learner_justification>`), last in the prompt, after the rubric. `delimitUntrusted` replaces any delimiter tag inside the text with `[removed tag]`, so it cannot close its block. The system prompt says the block is data, never instructions: requested verdicts, role play and formatting requests are ignored, only its system design content is graded.
- **Rubric**: a point is covered when the answer states its idea in any words; a misconception is a wrong statement, not imprecise wording. `correct` = every point covered and no misconception, `partially_correct` = at least one point covered, `incorrect` otherwise; empty, off-topic or nonsense answers and answers that only repeat the question are `incorrect`. No reward for length, no penalty for spelling or missing English terms.
- **Feedback**: French (the shared language rules, "tu", system design jargon in English, everyday words in French), tied to the notion(s) listed in the prompt. The model answer is in the prompt "for you only" and must not be copied verbatim: the learner sees it separately after the grading.
- **Schema refinements** (fed back on the automatic retry): `expectedPoints` has exactly one entry per expected point; `correct` with an uncovered point or a misconception, `partially_correct` with no covered point, and an empty `toReview` when not correct are rejected. Length caps keep the output short.
- **Contest**: the same prompt plus the first grading (verdict, per-point coverage and misconceptions) and the delimited justification. The model grades again from scratch as an independent examiner; the justification only counts when it points at what the answer already says or at a mistake of the first grading, and the explanation says whether it changed the grade.

Iterate with `node scripts/free-answer-grading-check.ts` (3 real CLI calls: a good, a partial and a wrong answer with an injection attempt on one caching question), which writes [[samples/free-answer-grading|the sample]]; review in [[Quiz Engine#Free-answer grading quality review (2026-10-09, sonnet, effort low)]].

## Flag and regenerate a question

- `flagQuestion(db, id, reason)` (`src/main/db/repositories/assessment.ts`) sets `flagged_at` and `flag_reason`. The quiz player calls it through `quiz:flagQuestion` when a question's Diagram cannot be drawn (reason pre-filled with `diagram could not be drawn (...)`).
- `regenerateQuestion(deps, id)` (`pipelines.ts`) runs the quiz prompt with `count: 1`, the same type, the flagged question's notions as focus, every prompt the quiz ever had in `avoidPrompts`, and the flagged prompt and reason in `replaces`. `replaceQuestion` then swaps the result in atomically: same position, same notion tags (copied, whatever the model tagged); the flagged row moves after the last position, keeps its attempts and points to its replacement (`replaced_by_question_id`). `listQuestions` returns the questions in play, `listQuestionHistory` all of them.

## How to iterate

1. Edit the prompt, bump its version constant.
2. `npm test`: builder and schema tests in `src/main/generation/prompts/prompts.test.ts` (free-answer grading: `freeAnswerGrading.test.ts`), pipelines (injected runner and the fake CLI) in `src/main/generation/pipelines.test.ts`. No real CLI call.
3. Opt-in real run, at most 5 CLI calls (outline, lesson, quiz on that lesson, one remediation, one spare for an automatic retry), on your Claude plan: `node scripts/prompt-quality-check.ts [topic-id] [output.md] [--skip-remediation] [--max-calls=N]`. A [[Foundations Module]] slug runs the ungrounded variants. It writes `docs/samples/<topic>.md` with automatic checks (unknown citations, notion markers, recap, quiz types and coverage, timings). Read it and judge by hand.

## Quality review (2026-10-09, `cache`, sonnet, effort low)

Sample: [[samples/cache|Sample content for Cache]]. 4 CLI calls, no retry: outline 7 s, lesson 29 s (4.6k output tokens), quiz 16 s, remediation 8 s.

What works:

- Natural French, technical terms in English, glossed on first use most of the time. Every citation is a valid section id; the lesson follows the structure exactly (markers in outline order, recap per notion).
- Faithful to the excerpts: no invented strategy, number or product beyond the primer's. The answer keys of the 6 questions are correct and each is answerable from the lesson; scenario questions set explicit constraints that make one option best.
- The remediation analogy is clear, maps back to the technical terms and says where it breaks.

Known weaknesses:

- **Coverage**: 8 notions for 6 questions; `cache-aside` and `object-level-caching` were not tested. The rule only asks for `min(notions, count)` covered notions. Open question: default `count` to the number of notions, or cap outlines at 6.
- **Granularity**: the model merged strategies (`write-through-and-write-behind`, `refresh-ahead-and-invalidation`) despite the split instruction, so mastery is tracked more coarsely than the spec's "cache-aside vs write-through" example.
- **Length and density**: the lesson is 1776 words, long for a complete beginner; citations after nearly every sentence are noisy (the lesson view should render them small). Some primer terms pass through without a gloss (cloning, auto-scaling, activity streams, user graph).
- **Angle overlap**: the lesson introduction already used a kitchen analogy and the analogy remediation used a restaurant too. Passing the lesson's analogy to the remediation prompt would help.
- **Distractors**: some are easy to rule out (absolute wording, or the correct choice is the longest). English plurals in French sentences ("des servers") read oddly.
- One run of one topic: no statistics. Ungrounded (Foundations Module) prompts: reviewed in [[Foundations Module Content#Quality review (2026-10-09, sonnet, effort low)]].

## Diagram quality review (2026-10-09)

Sample: [[samples/diagrams|Sample diagrams in generated lessons]], `node scripts/diagram-quality-check.ts` (default model and effort of the app). 4 real CLI calls: a `load-balancer` lesson (outline written by hand, 15 s), a Remediation Lesson on layer 4 vs layer 7 (`concrete_example`, 9 s), the `high_level_design` Protocol Step Lesson (7 s), and with `--repair-only` one real repair of a canned lesson with two broken blocks (3 s).

- **Validity**: 4 generated diagrams, all pass `checkDiagramSource` and mermaid's parser in Node; no repair was needed. The real repair fixed both crafted blocks (`<br/>` label quoted and joined, `mindmap` redrawn as a flowchart) and both then parse. Not drawn in the app for this run.
- **Correctness**: every diagram matches the excerpts and the text (client, load balancer, servers; layer 7 routing of video and billing traffic, which the primer gives as its example). No invented component or number.
- **Readability**: 3 to 4 nodes each, short French labels with English jargon, labelled arrows.
- **Weaknesses**: the diagrams are small and partly redundant with the text; the lesson's request flow stayed a numbered list instead of a sequenceDiagram, and its first flowchart leaves out the response path. The remediation put the diagram before its lead-in sentence, against the placement rule. The step lesson's high-level design is minimal (client, service, database, with back arrows). At the time of the run the pipeline only ran `checkDiagramSource`; mermaid's parser was added to it afterwards (2026-10-10), so syntax errors such as an unquoted parenthesis in a flowchart label are now repaired too. One run per content type: no statistics.
