---
title: Roadmap
tags: [roadmap, gantt]
status: live
---

# Roadmap

Gantt chart of the GitHub issues of `jbclaramonte/system-design-from-scratch`. Dependencies in the chart mirror the "Depends on" section of each issue. Dates and durations are estimates (solo, part-time pace not accounted for).

Last updated: 2026-10-10.

```mermaid
gantt
    title System Design From Scratch
    dateFormat YYYY-MM-DD
    excludes weekends
    axisFormat %d %b

    section Spikes
    #1 CLI latency and streaming spike        :done, crit, s1, 2026-10-12, 3d
    #2 tldraw license and shape library spike :done, s2, 2026-10-12, 2d

    section Foundation
    #3 Scaffold Electron + React + TS         :done, f1, after s1, 3d
    #4 SQLite schema and migrations           :done, f2, after f1, 3d

    section Content engine
    #5 Ingest and split primer corpus         :done, c1, after f1, 3d
    #6 Generation service (CLI, stream, cache):done, crit, c2, after f2, 5d
    #7 Grounded lesson and quiz prompts       :done, c3, after c1 c2, 4d

    section Mastery loop
    #8 Lesson view with streaming             :done, m1, after c3, 3d
    #9 Quiz engine and local grading          :done, m2, after c3, 5d
    #10 Free-answer grading by LLM            :done, m3, after m2, 3d
    #11 Mastery loop, remediation, settings   :done, crit, m4, after m1 m2, 5d

    section Design practice
    #12 Design canvas with typed shapes       :done, d1, after s2 f1, 5d
    #13 Canvas export (JSON + PNG)            :done, d2, after d1, 3d
    #14 Protocol steps, feedback, hints       :done, d3, after d2 m4, 6d
    #15 First two design exercises            :done, d4, after d3, 4d

    section Product
    #16 Foundations Module content            :done, p1, after m4, 4d
    #17 Learning path and unlock rules        :done, p2, after m4, 3d
    #18 Dashboard and notion map              :done, p3, after p2, 4d
    #19 About and attribution screen          :done, p4, after c1, 1d

    section Fixes
    #20 Claude CLI profile setting, auth errors :done, crit, x1, 2026-10-09, 1d
    #21 Topic title shown three times         :done, x2, 2026-10-09, 1d

    section Diagrams
    #22 Mermaid rendering in markdown         :done, crit, g1, 2026-10-12, 2d
    #23 Diagrams in lessons and step lessons  :done, g2, after g1, 3d
    #24 Diagrams in quiz scenarios            :done, g3, after g1, 3d

    section UX fixes
    #25 Topic status during round 1           :done, u1, 2026-10-12, 1d
    #26 Partially correct wording             :done, u2, 2026-10-12, 1d
    #27 Readable generation errors            :done, u3, 2026-10-12, 1d

    section Visual redesign
    #28 Design system tokens and base styles  :done, crit, v1, 2026-10-13, 2d
    #29 App shell                             :done, v2, after v1, 1d
    #30 Learning Path redesign                :done, v3, after v2, 2d
    #31 Dashboard, Settings, About redesign   :done, v4, after v2, 2d
    #32 Topic, Lesson, Remediation redesign   :done, v5, after v2, 2d
    #33 Quiz redesign                         :done, v6, after v2, 2d
    #34 Design exercise and canvas redesign   :done, v7, after v2, 2d
    #35 Review the lesson during a round      :done, v8, after v5, 1d
```

## Dependency table

| Issue | Depends on |
|---|---|
| #1 | none |
| #2 | none |
| #3 | #1 |
| #4 | #3 |
| #5 | #3 |
| #6 | #4, #1 |
| #7 | #5, #6 |
| #8 | #7 |
| #9 | #7 |
| #10 | #9 |
| #11 | #8, #9 |
| #12 | #2, #3 |
| #13 | #12 |
| #14 | #13, #11 |
| #15 | #14 |
| #16 | #11 |
| #17 | #11 |
| #18 | #17 |
| #19 | #5 |
| #20 | none |
| #21 | none |
| #22 | none |
| #23 | #22 |
| #24 | #22 |
| #25 | none |
| #26 | none |
| #27 | none |
| #28 | none |
| #29 | #28 |
| #30 | #29 |
| #31 | #29 |
| #32 | #29 |
| #33 | #29 |
| #34 | #29 |
| #35 | #32 |

## Conventions

- One bar per GitHub issue; label format `#<number> Title`.
- Status tags: `done`, `active`, `crit` (critical path).
- Update this chart and the table whenever an issue is created, started, closed, re-scoped, rescheduled, or its dependencies change.
