---
title: Interview Protocol
tags: [concept, design-practice]
---

# Interview Protocol

The sequence of system design interview steps, in canonical order: functional requirements, non-functional requirements, estimations, API, data model, high-level design, deep dive. Introduced progressively across exercises (exercise 1: functional requirements and high-level design; at most two new steps per exercise after that); each step is a [[Protocol Step]].

## Related

- Made of [[Protocol Step]]s
- Applied in a [[Design Exercise]]

## In code

`src/shared/protocol.ts`: `protocolSteps` (canonical order), `PROTOCOL_STEP_DEFINITIONS`, `PROTOCOL_UNLOCK_PLAN`, `activeStepsFor(exerciseIndex)`. Service `src/main/protocol/`, screens `src/renderer/src/design/protocol/`. Unlock plan and rationale: [[Interview Protocol Implementation]].
