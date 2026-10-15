---
title: Question Clarification
tags: [concept, assessment]
issue: 53
---

# Question Clarification

A plainer French rewording of a [[Question]] the learner does not understand, with one concrete example, shown under the Question by the "I don't understand the question" button. The Question and its choices stay on screen and the learner answers the original Question.

It clarifies the wording only: it never reveals the correct choice, never hints at which choice is right, never eliminates a choice and never teaches the answer. To make a leak impossible by construction, the prompt gets the Question as the learner sees it (prompt, scenario, choice texts) and nothing else: no `correct` flag, no explanation, no expected points or model answer, no [[Notion]] tags.

Not a [[Hint]] (graded help on a design [[Protocol Step]]) and not the explanation shown after an answer.

## Related

- Asks about a [[Question]] of the open [[Round]]
- Produced by a [[Generation]] and stored in the [[Content Cache]], one entry per Question and prompt version; "Reformulate differently" replaces it
- Outside the [[Mastery Loop]]: it never changes a score, a Round, a remediation or a topic status, and records no [[Attempt]]

## In code

Kind `question_clarification` (migration 5 lets the Content Cache hold it), key `{ questionId }` with the prompt version.

- Prompt and schema `buildQuestionClarificationGeneration` (`src/main/generation/prompts/questionClarification.ts`, `QuestionBrief` has no answer field), see [[Prompts#Question Clarification]].
- `createQuestionClarifier` (`src/main/quiz/questionClarifier.ts`), `QuizService.clarifyQuestion` (`src/main/quiz/service.ts`), channels `quiz:clarifyQuestion` and `quiz:cancelClarification` (`src/main/ipc/quiz.ts`), types in `src/shared/quiz.ts`.
- UI `ClarifyQuestion` and `useClarification` (`src/renderer/src/quiz/`), see [[Quiz Engine#Question Clarification (#53)]].
