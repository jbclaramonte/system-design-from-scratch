---
title: Prompts
tags: [generation, prompts]
issue: 7
---

# Prompts

The prompts and output schemas behind every content [[Generation]]: [[Notion Outline]], [[Lesson]], [[Quiz]] and [[Remediation Lesson]]. Code: `src/main/generation/prompts/` (pure builders) and `src/main/generation/pipelines.ts` (load from the database and the [[Source Corpus]], persist). They run through the [[Generation Service]]. Free-answer grading (#10) and [[Design Feedback]] (#14) prompts are not written yet; the generic `generation:start` IPC round trip (dev panel) still uses `placeholderPrompts.ts`.

## Shared rules

Every builder returns `{ kind, input, prompt: { version, system, user }, schema?, groundedSourceSections }`, ready for `service.generate` or `service.pregenerate`. Instructions are written in English; the output is French.

- **Language**: French for everything the learner reads, addressing the learner as "tu"; system design terms stay in English (cache, load balancer, sharding, TTL...), with an optional French gloss on first use; no English sentences.
- **Audience**: complete beginner who knows basic programming. Define every term on first use, short sentences, one concrete example per abstract idea.
- **[[Grounding]]**: only facts of the excerpts; analogies and examples allowed, new technical claims not. Text outputs cite inline as `[source: <section id>]` (one id per bracket, ids copied from the excerpt list); `findCitations` and `unknownCitations` in `prompts/common.ts` parse them. Quizzes put the ids in `sourceSections` instead.
- **Ungrounded variant** ([[Foundations Module]]): no excerpts, an explicit "write from well-established general knowledge, no citation" rule, `groundedSourceSections: []`, so the Generation output has `grounded: false` and `sourceSections: []`. Schemas then require empty `sourceSections`.
- **[[Excerpt|Excerpts]]**: a topic's section and its sub-topics (`findExcerpts({ sectionIds: [topic] })`), a notion's own sections for a remediation lesson. `assembleExcerpts` strips HTML images and link targets, drops empty sections, keeps excerpts in corpus order within a token budget (outline 6000, lesson 8000, quiz 8000, remediation 3000 tokens; every MVP topic fits), and wraps each in `<excerpt id="..." title="...">`.
- **Cache input**: `input` holds what the output depends on besides the prompt text: topic, notions, options, the excerpt ids and the corpus commit (`ungrounded` for foundations), the lesson as a SHA-256 for a quiz. With `prompt.version` it forms the [[Content Cache]] key.

## Versions

Bump the constant with any change to the prompt text or schema: it is part of the Content Cache key.

| Constant | Version | File |
|---|---|---|
| `NOTION_OUTLINE_PROMPT_VERSION` | `notion-outline-1` | `prompts/notionOutline.ts` |
| `LESSON_PROMPT_VERSION` | `lesson-1` | `prompts/lesson.ts` |
| `QUIZ_PROMPT_VERSION` | `quiz-1` | `prompts/quiz.ts` |
| `REMEDIATION_LESSON_PROMPT_VERSION` | `remediation-lesson-1` | `prompts/remediationLesson.ts` |

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

`buildQuizGeneration(topic, notions, grounding, options)`, structured. Options: `count` (default `max(6, number of targeted notions)`, so every targeted notion gets at least one question), `types` (default all four), `focusNotions` and `reminderNotions` ([[Mastery Loop]] rounds: fresh questions on missed notions plus at most `max(1, floor(count / 3))` reminder questions; only those notions can be tagged), `avoidPrompts` (earlier questions, never repeated), `lessonMarkdown` (questions must be answerable from it), `replaces` (flagged question and reason, see below).

```ts
{ questions: Array<
  | { type: 'single_choice' | 'multiple_choice', prompt, notions, sourceSections,
      choices: Array<{ text: string, correct: boolean }> /* 3 to 5 */, explanation: string }
  | { type: 'scenario', prompt, scenario: string, notions, sourceSections, choices, explanation }
  | { type: 'free_answer', prompt, notions, sourceSections,
      expectedPoints: string[] /* 1 to 4, rubric for #10 */, modelAnswer: string }
> }
```

`notions` and `sourceSections` are JSON-schema enums of the allowed slugs and excerpt ids, so the CLI constrains them. The Zod refinements (fed back to the model on the automatic retry) reject: exactly-one-correct violated for `single_choice` and `scenario`; fewer than 2 correct or no wrong choice for `multiple_choice`; duplicate choices, prompts or tags; a prompt from `avoidPrompts`; a missing type when `count` allows every type; fewer than `min(target notions, count)` target notions covered; too many reminder questions. Each `choices` item carries its own `correct` flag rather than an index, which avoids off-by-one answer keys. `saveQuiz` stores a result: `questions.prompt`, `questions.body` = the rest minus `type` and `notions` (tags go to `question_notions`).

## Remediation Lesson

`buildRemediationLessonGeneration(topic, notion, grounding, { angle, missedQuestionPrompts? })`, streamed Markdown on ONE notion, grounded on that notion's sections only. Angles: `concrete_example` (one realistic scenario followed step by step with numbers) or `analogy` (one non-computer analogy, mapped back element by element, with where it breaks). It must not open with the textbook definition, addresses the misunderstanding the missed questions reveal without answering them, 200 to 350 words, `## <notion title>` then `**À retenir**` with 2 or 3 bullets.

## Flag and regenerate a question

- `flagQuestion(db, id, reason)` (`src/main/db/repositories/assessment.ts`) sets `flagged_at` and `flag_reason`.
- `regenerateQuestion(deps, id)` (`pipelines.ts`) runs the quiz prompt with `count: 1`, the same type, the flagged question's notions as focus, every prompt the quiz ever had in `avoidPrompts`, and the flagged prompt and reason in `replaces`. `replaceQuestion` then swaps the result in atomically: same position, same notion tags (copied, whatever the model tagged); the flagged row moves after the last position, keeps its attempts and points to its replacement (`replaced_by_question_id`). `listQuestions` returns the questions in play, `listQuestionHistory` all of them.

## How to iterate

1. Edit the prompt, bump its version constant.
2. `npm test`: builder and schema tests in `src/main/generation/prompts/prompts.test.ts`, pipelines (injected runner and the fake CLI) in `src/main/generation/pipelines.test.ts`. No real CLI call.
3. Opt-in real run, at most 5 CLI calls (outline, lesson, quiz on that lesson, one remediation, one spare for an automatic retry), on your Claude plan: `node scripts/prompt-quality-check.ts [topic-id] [output.md]`. It writes `docs/samples/<topic>.md` with automatic checks (unknown citations, notion markers, recap, quiz types and coverage, timings). Read it and judge by hand.

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
- One run of one topic: no statistics. Ungrounded (Foundations Module) prompts were not run for real.
