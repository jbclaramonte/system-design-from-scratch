---
title: Generation Language
tags: [concept, generation]
---

# Generation Language

The language the course content is written in: French (the default, and the only language until #57) or English, chosen in Settings as "Course language". It applies to every [[Generation]] that produces text the learner reads, and to the [[Design Exercise]] problem statements. The app UI is English whatever it is.

- French keeps the jargon rule (system design terms in English, everyday computing words in French, "tu"); English has no translation rule ("you", terms as said in interviews).
- It is part of the [[Content Cache]] key: a topic can have a [[Lesson]], [[Quiz]]zes and [[Remediation Lesson]]s in each language, and switching never deletes or overwrites the other one.
- It never affects mastery: [[Notion]]s, [[Round]]s, scores and the [[Learning Path]] do not depend on the language.
- A [[Round]] in progress finishes in the language of its quiz (its grading, [[Question Clarification]]s and replaced questions follow it); the new setting applies to what is generated next. The quiz [[Pre-generation]] while a lesson is read uses the language of that lesson.
- The [[Notion Outline]] is generated once and keeps the language of the first lesson.

## Related

- Chosen in Settings, read by every [[Generation]] when it is prepared
- Written into the prompts by the language profile, see [[Prompts#Generation Language]]
- Stored per row on lessons, quizzes and remediation lessons, see [[Data Model]]

## In code

`GenerationLanguage` (`fr` | `en`, default `fr`) in `src/shared/generationLanguage.ts`, the `generationLanguage` setting in `src/shared/settings.ts` (key `generation_language`, `getGenerationLanguage` in `src/main/db/repositories/settings.ts`), the language profile in `src/main/generation/languageProfile.ts` (the one source of truth for what each language's prompts say), `language` on `GenerationRequest` and in `contentCacheKey` (`src/main/db/repositories/contentCache.ts`), the `language` column added by migration 8. Design Exercise statements: `problemStatements` in `src/main/protocol/designExercises.ts`. See [[Generation Service]].
