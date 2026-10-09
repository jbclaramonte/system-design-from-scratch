---
title: Hint
tags: [concept, design-practice]
---

# Hint

Graded, spoiler-free help on a [[Protocol Step]], requested by the user. Three levels per step and exercise: nudge (an open question), direction (where to look and why), near-solution (the shape of a good answer, never the full answer). Never reveals the [[Reference Solution]].

## Related

- Attached to a [[Protocol Step]]

## In code

`design_feedback` rows with `kind = hint` (`{ level, promptVersion, hint }`), repository `src/main/db/repositories/designPractice.ts`. Levels: `nextHintLevel` in `src/shared/protocol.ts`. Prompt `buildHintGeneration` (`src/main/generation/prompts/designFeedback.ts`), channel `protocol:requestHint`. See [[Data Model]] and [[Interview Protocol Implementation]].
