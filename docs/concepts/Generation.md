---
title: Generation
tags: [concept, generation]
---

# Generation

One LLM call, made by driving the Claude Code CLI as a subprocess, that produces content or grades a free answer. Lessons are streamed; quizzes are pre-generated in the background.

## Related

- Produces [[Lesson]], [[Remediation Lesson]], [[Quiz]], free-answer grading and [[Design Feedback]]
- Results stored in the [[Content Cache]]
- Started ahead of need as a [[Pre-generation]]
- [[Grounding|Grounded]] on [[Excerpt|excerpts]] of the [[Source Corpus]]

## In code

`src/main/generation/` (`GenerationService`, CLI runner, queue), shared event types in `src/shared/generation.ts`, IPC channels `generation:start`, `generation:cancel` and `generation:event` in `src/shared/ipc.ts`. See [[Generation Service]].
