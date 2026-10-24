---
title: Generation Language
tags: [concept, generation]
---

# Generation Language

The language the course content is written in: French (the default, and the only language until #57) or English, asked once at the first launch (#61) and changed afterwards in Settings as "Course language". It applies to every [[Generation]] that produces text the learner reads, and to the [[Design Exercise]] problem statements. The app UI is English whatever it is.

- **First-run choice** (#61): on a fresh data folder a screen, shown before the [[Learning Path]], asks "Course language" (Français / English), in both languages since the language is not known yet. The system language is preselected when it is French or English, French otherwise; arrow keys and Enter work, and the preselected choice has the focus. It explains that the choice can be changed later in Settings but that each language generates its own content. Nothing is generated and no request is made (not even the launch update check) before the choice. The choice is stored as the `generationLanguage` setting together with a "language chosen" marker, distinct from the default value, so the screen appears once; changing the language in Settings later never brings it back.
- An install that predates the question never sees it: migration 9 sets the marker when the data folder already holds any learner data (content, a [[Round]], an [[Attempt]], design work) or a setting the learner saved, and that install keeps its current language (French by default). A folder that only ever ran the app, with none of that, shows the screen.
- French keeps the jargon rule (system design terms in English, everyday computing words in French, "tu"); English has no translation rule ("you", terms as said in interviews).
- It is part of the [[Content Cache]] key: a topic can have a [[Lesson]], [[Quiz]]zes and [[Remediation Lesson]]s in each language, and switching never deletes or overwrites the other one.
- It never affects mastery: [[Notion]]s, [[Round]]s, scores and the [[Learning Path]] do not depend on the language.
- A [[Round]] in progress finishes in the language of its quiz (its grading, [[Question Clarification]]s and replaced questions follow it); the new setting applies to what is generated next. The quiz [[Pre-generation]] while a lesson is read uses the language of that lesson.
- The [[Notion Outline]] is generated once and keeps the language of the first lesson.

## Related

- Chosen at the first launch, changed in Settings, read by every [[Generation]] when it is prepared
- Written into the prompts by the language profile, see [[Prompts#Generation Language]]
- Stored per row on lessons, quizzes and remediation lessons, see [[Data Model]]

## In code

`GenerationLanguage` (`fr` | `en`, default `fr`) in `src/shared/generationLanguage.ts`, the `generationLanguage` setting in `src/shared/settings.ts` (key `generation_language`, `getGenerationLanguage` in `src/main/db/repositories/settings.ts`), the language profile in `src/main/generation/languageProfile.ts` (the one source of truth for what each language's prompts say), `language` on `GenerationRequest` and in `contentCacheKey` (`src/main/db/repositories/contentCache.ts`), the `language` column added by migration 8. First-run choice: the "language chosen" marker (`generation_language_chosen`, migration 9, `isGenerationLanguageChosen` and `chooseGenerationLanguage` in `src/main/db/repositories/settings.ts`), `firstRun:get` / `firstRun:chooseLanguage` (`src/main/settings/firstRunIpc.ts`, types in `src/shared/firstRun.ts`), the preselection `suggestedGenerationLanguage` (`src/shared/generationLanguage.ts`), and `FirstRunGate` / `FirstRunScreen` in `src/renderer/src/firstRun/`. Design Exercise statements: `problemStatements` in `src/main/protocol/designExercises.ts`. See [[Generation Service]].

## Checked by hand (#61)

On 2026-10-16, with the packaged app (`npm run package:dir`), a scratch `--user-data-dir`, a scratch `HOME` and a fake Claude Code CLI (a lesson in English when the system prompt asks for English): a fresh folder shows the first-run screen and no CLI call happened before the choice; choosing English (click, then Enter) stores `generation_language = "en"` and `generation_language_chosen = true`, and the first lesson shown is the English one (both CLI calls carried the English prompt); a restart opens the Learning Path directly; a folder whose marker and migration 9 were removed but which holds a lesson gets the marker back from migration 9 and does not show the screen. The same flow, with the keyboard, is the first checks of `npm run smoke:packaged`.
