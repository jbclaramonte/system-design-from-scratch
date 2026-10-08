// Shared helpers for the CLI latency spike (issue #1).
// Plain Node ESM, no dependencies.
//
// runClaude() spawns `claude -p --output-format stream-json --include-partial-messages`,
// parses the NDJSON stream line by line and records timestamps for every milestone.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Flag presets. "isolated" is what we recommend for the app. */
export const PRESETS = {
  // What you get if you only add the print/stream flags: loads the user's hooks,
  // plugins, MCP servers, CLAUDE.md, skills... (huge hidden context).
  naive: ['--no-session-persistence'],
  // Strip everything that is not the model call itself.
  isolated: [
    '--no-session-persistence',
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--safe-mode',
  ],
};

export const DEFAULT_SYSTEM_PROMPT =
  'You are a content generator for a learning app. Output only the requested content, no preamble.';

/** Fresh empty cwd so no CLAUDE.md / project settings are discovered. */
export function makeEmptyCwd() {
  return mkdtempSync(join(tmpdir(), 'cli-spike-'));
}

const now = () => performance.now();

/**
 * @param {object} o
 * @param {string} o.prompt
 * @param {string} [o.model]            alias (haiku, sonnet, opus...) or full name
 * @param {string} [o.systemPrompt]
 * @param {object} [o.jsonSchema]       passed to --json-schema
 * @param {string} [o.preset]           key of PRESETS
 * @param {string[]} [o.extraArgs]
 * @param {string} [o.bin]              executable, default "claude"
 * @param {string} [o.cwd]
 * @param {number} [o.killAfterMs]      kill subprocess this long after the first text delta
 * @param {(text:string)=>void} [o.onDelta]  called for each text delta (token streaming)
 * @param {AbortSignal} [o.signal]
 */
export function runClaude(o) {
  const preset = PRESETS[o.preset ?? 'isolated'];
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose', // required by the CLI for stream-json in print mode
    ...preset,
  ];
  if (o.model) args.push('--model', o.model);
  if (o.systemPrompt !== null) args.push('--system-prompt', o.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  if (o.jsonSchema) args.push('--json-schema', JSON.stringify(o.jsonSchema));
  if (o.extraArgs) args.push(...o.extraArgs);
  // Prompt goes through stdin so there is no argv length limit (primer excerpts are big).

  return new Promise((resolve) => {
    const t0 = now();
    const m = {
      model: o.model, preset: o.preset ?? 'isolated',
      spawnError: null, exitCode: null, signal: null, killed: false,
      tFirstStdout: null, tFirstThinking: null, thinkingDeltas: 0, blockTypes: [], tInit: null, tRequesting: null, tFirstDelta: null,
      tLastDelta: null, tResult: null, tExit: null,
      deltaCount: 0, deltaTimes: [], deltaChars: [],
      text: '', structured: undefined, result: null, stderr: '', events: 0,
      cacheCreate: null, cacheRead: null, outputTokens: null, costUsd: null,
      isError: null, apiMs: null,
    };

    let child;
    try {
      child = spawn(o.bin ?? 'claude', args, {
        cwd: o.cwd ?? makeEmptyCwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (e) {
      m.spawnError = String(e);
      return resolve(m);
    }
    m.pid = child.pid;
    m.kill = (sig = 'SIGTERM') => { m.killed = true; child.kill(sig); };
    if (o.signal) o.signal.addEventListener('abort', () => m.kill(), { once: true });

    child.on('error', (e) => { m.spawnError = `${e.code ?? ''} ${e.message}`; m.tExit = now() - t0; resolve(m); });
    child.stdin.on('error', () => {});
    child.stdin.end(o.prompt);

    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const t = now() - t0;
      if (m.tFirstStdout === null) m.tFirstStdout = t;
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        m.events++;
        handle(ev, now() - t0);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { m.stderr += d; });

    function handle(ev, t) {
      if (ev.type === 'system' && ev.subtype === 'init' && m.tInit === null) m.tInit = t;
      else if (ev.type === 'system' && ev.subtype === 'status' && ev.status === 'requesting' && m.tRequesting === null) m.tRequesting = t;
      else if (ev.type === 'stream_event') {
        const e = ev.event;
        if (e.type === 'message_start' && e.message?.usage) {
          m.cacheCreate = e.message.usage.cache_creation_input_tokens;
          m.cacheRead = e.message.usage.cache_read_input_tokens;
        }
        if (e.type === 'content_block_start') m.blockTypes.push(e.content_block?.type);
        if (e.type === 'content_block_delta' && e.delta?.type === 'thinking_delta') {
          if (m.tFirstThinking === null) m.tFirstThinking = t;
          m.thinkingDeltas++;
        }
        if (e.type === 'content_block_delta') {
          // text_delta for plain text; input_json_delta when --json-schema uses a tool call under the hood
          const d = e.delta;
          const txt = d.type === 'text_delta' ? d.text : d.type === 'input_json_delta' ? d.partial_json : null;
          if (txt != null) {
            if (m.tFirstDelta === null) {
              m.tFirstDelta = t;
              if (o.killAfterMs != null) setTimeout(() => m.kill('SIGTERM'), o.killAfterMs);
            }
            m.tLastDelta = t; m.deltaCount++; m.deltaTimes.push(t); m.deltaChars.push(txt.length);
            m.text += txt;
            o.onDelta?.(txt);
          }
        }
      } else if (ev.type === 'result') {
        m.tResult = t; m.result = ev.result; m.isError = ev.is_error; m.apiMs = ev.duration_api_ms;
        m.costUsd = ev.total_cost_usd; m.outputTokens = ev.usage?.output_tokens;
        m.structured = ev.structured_output;
        m.subtype = ev.subtype;
      }
    }

    child.on('close', (code, sig) => {
      m.exitCode = code; m.signal = sig; m.tExit = now() - t0;
      resolve(m);
    });
  });
}

export const median = (xs) => {
  const a = xs.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const h = a.length >> 1;
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
};

export const ms = (x) => (x == null ? 'n/a' : `${Math.round(x)}ms`);

/** Summary row for one run (all values in ms from spawn). */
export function summarize(m) {
  return {
    model: m.model, preset: m.preset,
    init: m.tInit, firstDelta: m.tFirstDelta, lastDelta: m.tLastDelta, result: m.tResult, exit: m.tExit,
    ttftAfterInit: m.tFirstDelta != null && m.tInit != null ? m.tFirstDelta - m.tInit : null,
    streamSpan: m.tFirstDelta != null ? m.tLastDelta - m.tFirstDelta : null,
    firstThinking: m.tFirstThinking, thinkingDeltas: m.thinkingDeltas, blocks: m.blockTypes.join(','),
    deltas: m.deltaCount, chars: m.text.length, outTokens: m.outputTokens,
    cacheCreate: m.cacheCreate, cacheRead: m.cacheRead, costUsd: m.costUsd,
    isError: m.isError, exitCode: m.exitCode,
  };
}

/** Append one JSON line per run to results.jsonl next to this file, for the write-up. */
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function logResult(label, m, extra = {}) {
  const { deltaTimes, ...rest } = m; // keep file small
  const row = { label, at: new Date().toISOString(), ...summarize(m), ...extra };
  appendFileSync(fileURLToPath(new URL('./results.jsonl', import.meta.url)), JSON.stringify(row) + '\n');
  return row;
}
