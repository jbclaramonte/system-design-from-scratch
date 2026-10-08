---
title: CLI latency and streaming spike
tags: [spike, generation, findings]
issue: 1
date: 2026-10-08
cli-version: 2.1.294
status: done
---

# CLI latency and streaming spike

Findings for issue #1. Question: how does driving the Claude Code CLI as a Node subprocess behave for our [[Generation|Generations]] (see [[SPEC]] section 3 and 4.3)? Code: `spikes/cli-latency/`.

> [!summary] Verdict
> The CLI is good enough, **provided it is launched in an isolated configuration** (otherwise every call drags in the user's hooks, plugins and MCP servers: +1 s of startup and 20-45k hidden tokens). With `--model sonnet --effort low`, a [[Lesson]] streams its first token after about **1.6 s** and completes in about **14 s**; a [[Quiz]] with enforced JSON schema completes in about **7 s**. Background pre-generation as written in SPEC 4.3 is enough. No extra caching layer is needed beyond the [[Content Cache]].

## Setup

- Machine: macOS (Darwin 25.6), Node 26.8, `claude` 2.1.294, logged in with a Claude subscription (OAuth).
- All timings are milliseconds from `spawn()` in Node, parsed from the `stream-json` NDJSON stream. Medians over n runs (n is shown). Single machine, home network, one evening: treat as orders of magnitude.
- About 37 CLI calls in total. Raw per-run data: `spikes/cli-latency/results.jsonl`; aggregate with `node report.mjs`.
- Prompts: lesson = "600 to 700 words, French Markdown, load balancers, beginner"; quiz = 5 questions, 4 types (`single_choice`, `multiple_choice`, `true_false`, `tags`), French, with explanations. See `prompts.mjs`.

## Results

"Init" = the `system:init` event (CLI booted, ready to call the API). "First token" = first text (or JSON) delta. "Done" = the `result` event. "Exit" = process exit.

| Scenario | n | Init | First token | Done | Exit | Output |
|---|---|---|---|---|---|---|
| Ping, haiku, **naive** flags | 3 | 1866 | 2757 | 3089 | 3850 | 4 tok, 20-30k hidden ctx tokens |
| Ping, haiku, **isolated** flags | 3 | 985 | 1590 | 1614 | 2175 | 4 tok, ~600 ctx tokens |
| Lesson, sonnet, `--effort low` | 3 | 878 | **1633** | **13750** | 14147 | 705 words, 1689 tok |
| Lesson, sonnet, default effort | 3 | 896 | 1956 | 15096 | 15523 | 754 words |
| Lesson, haiku, `--effort low` | 3 | 890 | 1450 | 7425 | 7860 | 511 words (short of 600) |
| Quiz, sonnet, schema, `--effort low` | 3 | 885 | **1693** | **6940** | 7378 | 233 words, 888 tok |
| Quiz, haiku, schema, `--effort low` | 4 | 925 | 5231 | 9448 | 9856 | 373 words, 2040 tok |
| Quiz, haiku, schema, default effort | 2 | 928 | 6270 | 10615 | 11137 | 379 words |
| Quiz, haiku, prompt-only JSON, `--effort low` | 3 | 914 | 6751 | 9869 | 10290 | 281 words |
| 3 lessons in parallel, sonnet, low | 3 | 900 | 1639 | 13847 | 14263 | 714 words |

Approximate list cost per call (`total_cost_usd`, informational on a subscription): sonnet lesson 0.020 USD, sonnet quiz 0.012 USD, haiku lesson 0.0008 USD, haiku quiz 0.0012 USD.

### (a) Cold start

The CLI needs about **0.9 s** from spawn to `init` and about **1.5-1.6 s** to the first token of a trivial reply (isolated). There is no separate "cold" penalty: every call is a fresh process, so every call pays this. About 0.45 s after `result` the process exits (teardown); the app should treat `result` as completion, not process exit.

With only the print/stream flags (naive), the CLI loads the user's `SessionStart` hooks, plugins, MCP servers and skills. Here that injected 20-45k tokens of unrelated context (including a "caveman mode" hook that would change the style of generated French), doubled startup (1.9 s to init) and made the first call of a series expensive (30k cache-creation tokens). Isolation is not optional.

### (b) Time to first token

Floor is about **1.5-1.7 s** (0.9 s CLI boot + 0.6-0.8 s API) for sonnet and haiku on text output. Two traps:

- **Haiku thinks silently on structured output.** With `--json-schema` it emitted a `thinking` block first: first token at 4.7-6.7 s, far slower than sonnet (1.7 s). `--effort low` only removed it in 2 of 5 schema runs; `MAX_THINKING_TOKENS=0` had no effect (1 run). Sonnet never thought at low effort.
- `--effort low` shaved about 0.3 s of TTFT and 1.3 s of total on sonnet lessons, and dropped thinking on some haiku runs.

### (c) Total time

- Lesson (sonnet, low): **13.8 s** for 705 words. Reading 700 words takes about 3 minutes, so the stream is 10 times faster than the reader and never starves.
- Quiz (sonnet, schema, low): **6.9 s**. Faster than haiku (9.4 s) because haiku thinks and writes 60% more text.
- Haiku is 10-25 times cheaper but not faster for quizzes, and undershoots lesson length (511 words for a 600-700 request).

### (d) Streaming granularity

Deltas arrive as `stream_event` / `content_block_delta` / `text_delta` (needs `--include-partial-messages`). They are **small chunks, not strictly one token each**: about 11-12 characters (about 4-5 tokens) per delta, median gap 20 ms (haiku) / 33 ms (sonnet), worst gap 100 ms (haiku) / 430 ms (sonnet). Smooth enough to render directly in React; no need to buffer. One lesson is about 360 deltas.

With `--json-schema`, the CLI makes the model call a hidden structured-output tool: the deltas are `input_json_delta` fragments (partial JSON), and the validated object is in `result.structured_output`. Do not render the fragments; wait for the result (or use a partial-JSON parser if progressive rendering of questions is wanted).

### (e) Structured JSON reliability

| Mode | Runs | Valid |
|---|---|---|
| `--json-schema` (sonnet 3, haiku 8) | 11 | 11/11 |
| Prompt-only JSON + loose extraction (haiku) | 3 | 3/3 |

"Valid" = parses, matches `QUIZ_SCHEMA`, exactly 5 questions, all 4 types present, `correct` indexes in range, `single_choice`/`true_false` shape (`validateQuiz` in `prompts.mjs`). Even prompt-only was fine, but with `--json-schema` the CLI enforces the shape and hands back a parsed object, so we skip fences and prose-stripping. The schema cannot express semantic checks (is the marked answer actually correct); validate shape with Zod anyway and retry once on failure. The "cleanJson" flag for the prompt-only mode was not logged in this run (added to `generate.mjs` for next time), so we do not know how often the model wrapped JSON in fences.

### (f) Cancellation

`child.kill('SIGTERM')` 1.5 s after the first token: the process exited with code 143 about 0.55 s later, no `result` event, no leftover process, partial text (95 words) already delivered. Wire this to `AbortSignal` (the lib supports it) for "user left the page" and app quit.

### (g) Parallel calls

3 sonnet lessons at once: first token 1639 ms (vs 1633 sequential), done 13.85 s (vs 13.75 s). No measurable slowdown, no rate-limit error. Concurrency above 3 was not tested; each process is a full CLI; memory per process was not measured.

### (h) Error cases

| Case | Behaviour |
|---|---|
| `claude` not on PATH | `spawn` emits `ENOENT` within 1-8 ms. No CLI call needed to detect. |
| Electron launched from Finder/Dock (minimal PATH `/usr/bin:/bin:...`) | **Reproduces ENOENT** even though `claude` works in a terminal (it lives in `~/.local/bin`). Resolve the absolute path at startup (login-shell `command -v claude`), allow a settings override, and show a clear "install/log in to Claude Code" screen. |
| Bad model name | Exit code 1 after about 1.9 s; `result` event has `is_error: true` with a readable message ("There's an issue with the selected model..."), stderr has `[claude-code:unrecognized_model]`. Quirk: `subtype` is still `"success"`, so check `is_error` and the exit code, not `subtype`. |
| Not tested | Offline, expired login, rate limit/quota exhaustion, malformed schema, concurrent kill. |

## Recommendation

### Is background pre-generation enough? Yes.

- **Quiz**: pre-generated while the learner reads the lesson (minutes) and needs 7 s. Fully hidden. Keep a loading state in case the learner skims in under 10 s.
- **Lesson**: streamed, perceived wait is about 1.6 s, then text arrives far faster than it can be read. No pre-generation needed for the first view.
- **Remediation lessons** depend on quiz results so they cannot be pre-generated, but streaming makes the wait about 1.6 s.
- **Repeat visits**: served from the [[Content Cache]], zero latency.
- Cheap optional extra: when the learner starts a quiz, prefetch the next Topic's lesson in the background (a few cents per lesson), so the next first token is instant. Not required.
- Not covered by this spike: free-answer grading and Design Exercise feedback (likely longer, non-streamable if structured), and the effect of large grounding excerpts from the primer on input time. Measure when those issues are built.

### Flags and model

```bash
claude -p \
  --output-format stream-json --include-partial-messages --verbose \
  --model sonnet --effort low \
  --system-prompt "<generation system prompt>" \
  --no-session-persistence --tools "" \
  --setting-sources "" --strict-mcp-config --disable-slash-commands --safe-mode \
  [--json-schema '<schema>']      # quiz only
# prompt on stdin (no argv size limit); cwd = empty temp dir
```

- `--verbose` is required for `stream-json` in print mode.
- Use **sonnet** (alias) for lessons and quizzes with `--effort low`. Pin a full model id in app settings rather than relying on a floating alias (the `haiku` alias resolved to `claude-haiku-5-5` here).
- Use `--json-schema` for every structured [[Generation]].
- Haiku is not recommended for quizzes (silent thinking, slower than sonnet) and undershoots lesson length. Reconsider it for short, cheap tasks (answer grading) after measuring.
- I did not ablate the five isolation flags individually; keep them together. `--bare` is not usable: per `--help` it only authenticates through `ANTHROPIC_API_KEY`, never OAuth.
- Consider `--max-budget-usd` as a safety net.

## Risks

- **Config leakage**: without isolation, the user's hooks/plugins change the output and latency. Keep the isolation flags and an end-to-end check (output is French, no persona text).
- **Unstable surface**: flags (`--safe-mode`, `--effort`) and the `stream-json` event shapes are CLI internals that can change between versions. Check `claude --version` at startup, parse defensively (ignore unknown events), and add a smoke test in CI-like manual checks.
- **PATH and install detection** in a packaged Electron app (see (h)); also auth state: detect with `claude auth status` and guide the user.
- **Subscription quota**: calls draw on the user's plan. A `rate_limit_event` in the stream showed 83% of the 7-day window used on this account. Content Cache + background generation should be metered; surface quota errors cleanly.
- **Terms of use**: confirm that driving the CLI from a personal desktop app is within the subscription terms before building more on it (single-user personal tool today; relevant if the app is opened up, see SPEC section 2).
- **Output length drift**: lessons came out at 705 words (sonnet) vs 511 (haiku) for the same prompt; treat length as approximate.
- **Error signalling quirks**: `subtype: "success"` with `is_error: true`; `result` arrives about 0.45 s before process exit.
- **Process hygiene**: always kill children on cancel and app quit; cap concurrency (2-3 tested).
- **Small samples**: n=3 per cell, one machine; re-measure on the target network.

## Reproduce

```bash
cd spikes/cli-latency
node stream-demo.mjs sonnet          # token streaming to the terminal
./run-all.sh                         # full matrix, about 30 CLI calls
node report.mjs                      # medians from results.jsonl
```

Files: `lib.mjs` (spawn + stream parser + timings), `cold-start.mjs`, `generate.mjs` (lesson/quiz/parallel), `errors.mjs` (errors + cancel), `prompts.mjs` (prompts, quiz schema, validator), `report.mjs`.
