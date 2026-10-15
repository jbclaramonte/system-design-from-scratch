---
title: Lesson Question
tags: [concept, learning-content]
issue: 52
---

# Lesson Question

A question the learner asks about a passage they selected while reading a [[Lesson]], a [[Remediation Lesson]] or a [[Protocol Step Lesson]]. A side panel on the right of the text quotes the passage and keeps a short thread of questions and streamed answers (in French), so the learner can ask follow-ups without leaving the app.

The answer is a [[Generation]] grounded on the text being read and on the [[Excerpt|Excerpts]] of its topic ([[Grounding]]); when the question goes beyond the course, the answer says so instead of inventing.

Not to be confused with a quiz [[Question]].

## Related

- Asked about a [[Lesson]], a [[Remediation Lesson]] or a [[Protocol Step Lesson]]
- Grounded on the [[Excerpt|Excerpts]] of the topic ([[Grounding]])
- Run by the [[Generation]] service; never stored in the [[Content Cache]]
- Outside the [[Mastery Loop]]: it never counts in a [[Quiz]] score, a [[Round]] or a topic status
- Not offered while a [[Quiz]] [[Round]] is open (including the Lesson reading panel opened during a round), otherwise it could give away the answers

## In code

In memory only: the thread lives in the open panel and is discarded when it closes or the learner leaves the text. No table, no migration. Each question is sent with the earlier finished exchanges of the thread.

- Prompt `buildLessonQuestionGeneration` (`src/main/generation/prompts/lessonQuestion.ts`, kind `lesson_question`), see [[Prompts#Lesson Question]].
- IPC `lessonQuestion:ask` / `lessonQuestion:cancel`, events on `lessonQuestion:event` (`src/main/lessonQuestion/lessonQuestionIpc.ts`, types in `src/shared/lessonQuestion.ts`). The main process refuses it while a Quiz round of the topic is open (`hasOpenRound`).
- UI `src/renderer/src/lesson/ask/` (`LessonAsk`, `LessonQuestionPanel`), used by the Lesson, Remediation Lesson and Protocol Step Lesson views, see [[Lesson View#Lesson Question]].
