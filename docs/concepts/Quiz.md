---
title: Quiz
tags: [concept, assessment]
---

# Quiz

A set of [[Question]]s on a [[Topic]], played as one [[Round]]. Pre-generated in the background while the [[Lesson]] is read. Questions are fresh after each failed round.

## Related

- Composed of [[Question]]s
- Played in a [[Round]]
- Validated against the [[Mastery Threshold]]

## In code

Table `quizzes`, repository `src/main/db/repositories/assessment.ts`. See [[Data Model]].

Prompt and output schema `buildQuizGeneration` / `quizSchema` (`src/main/generation/prompts/quiz.ts`), request built by `prepareQuiz` and stored by `saveQuiz` (`src/main/generation/pipelines.ts`). See [[Prompts]].

Played by the [[Quiz Engine]]: `createQuizService` (`src/main/quiz/service.ts`), `quiz:*` IPC (`src/main/ipc/quiz.ts`), screens in `src/renderer/src/quiz/`. The renderer only gets `QuizView` / `QuestionView` (`src/shared/quiz.ts`), without answer keys.
