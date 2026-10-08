# CLAUDE.md

Desktop app (Electron + React + TypeScript) for learning system design from scratch. Full product spec: `docs/SPEC.md`.

## Repository language

English is the official language of this repo: code, comments, commit messages, issues, PRs, documentation, UI strings in source, and the vault. Course content shown to the end user is generated in French (see spec), but everything written in the repo stays in English.

## Task tracking

- All to-do tracking is done in **GitHub Issues** on `jbclaramonte/system-design-from-scratch` (use the `gh` CLI). Do not track tasks in markdown checklists, TODO files, or code comments.
- One issue per deliverable task. Reference the issue number in commits and PRs (`Closes #12`).
- Every issue must have a **"Depends on"** section listing the issues it depends on (`- #12 Title`), or `None.`. Keep it accurate when scope changes, and mirror it in `docs/ROADMAP.md` (chart and dependency table).
- Issue body layout: Goal, Acceptance criteria, Depends on, Reference. Label each issue with one area label (`spike`, `foundation`, `content-engine`, `mastery-loop`, `design-practice`, `product`).
- Before starting work, find or create the matching issue. When scope changes, update the issue rather than diverging silently.
- Creating, closing, or re-scoping issues is visible on GitHub: confirm with the user before bulk operations.

## Gantt chart

- Maintain `docs/ROADMAP.md`, a Mermaid Gantt chart of the tasks, so the user can monitor progress at a glance.
- Every task in the chart maps to a GitHub issue (put `#<number>` in the task label). A task without an issue does not belong in the chart.
- Update the chart whenever an issue is created, started, closed, re-scoped, or rescheduled: status tags (`done`, `active`, `crit`), dates, and dependencies.
- Dates are estimates; when reality drifts, adjust the chart and say so.

## Obsidian vault and ubiquitous language

- `docs/` is an Obsidian vault (open the `docs/` folder in Obsidian). Use Obsidian-flavored Markdown: `[[wikilinks]]`, YAML frontmatter, callouts.
- `docs/Ubiquitous Language.md` is the single source of truth for domain terms. **Consult it before naming anything** (types, tables, components, issues, UI copy) and use the exact term defined there.
- When a new domain term appears or an existing one changes meaning, update the glossary and the matching note under `docs/concepts/` in the same change as the code.
- Each concept note: one term, a short definition, relations to other concepts as wikilinks, and pointers to where it lives in the code once implemented.
- Do not use synonyms of glossary terms in code or docs (see the "Avoid" lines in the glossary).

## Docs map

- `docs/Home.md`: vault entry point.
- `docs/SPEC.md`: product spec.
- `docs/ROADMAP.md`: Gantt chart.
- `docs/Ubiquitous Language.md`: glossary.
- `docs/concepts/`: one note per domain concept.

## Git

- Remote: `git@github.com:jbclaramonte/system-design-from-scratch.git`, default branch `main`.
- Commit and push only when the user asks.
