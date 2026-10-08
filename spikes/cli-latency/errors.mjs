// Cheap error cases and cancellation. Costs 2 CLI calls (bad model, cancel); the PATH cases are free.
import { execSync } from 'node:child_process';
import { runClaude, logResult } from './lib.mjs';
import { LESSON_PROMPT, LESSON_SYSTEM } from './prompts.mjs';

const show = (name, m) => console.log(name, JSON.stringify({
  spawnError: m.spawnError, exitCode: m.exitCode, signal: m.signal, killed: m.killed,
  isError: m.isError, subtype: m.subtype, result: (m.result ?? '').slice(0, 300), stderr: m.stderr.slice(0, 300),
  tFirstStdout: Math.round(m.tFirstStdout ?? -1), tResult: Math.round(m.tResult ?? -1), tExit: Math.round(m.tExit ?? -1),
}));

// 1. claude not on PATH (binary name does not exist) -> ENOENT from spawn, no CLI call.
show('not-on-path:bad-bin', await runClaude({ prompt: 'x', bin: 'claude-does-not-exist' }));

// 2. Realistic Electron case: app launched from Finder/Dock gets a minimal PATH (no ~/.local/bin).
{
  const saved = process.env.PATH;
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  show('not-on-path:minimal-PATH', await runClaude({ prompt: 'x' }));
  process.env.PATH = saved;
}

// 3. Bad model name (1 CLI call).
{
  const m = await runClaude({ prompt: 'Reply ok', model: 'definitely-not-a-model' });
  logResult('error:bad-model', m);
  show('bad-model', m);
}

// 4. Cancellation: kill the subprocess 1.5 s after the first streamed token (1 CLI call).
{
  const p = runClaude({ prompt: LESSON_PROMPT, systemPrompt: LESSON_SYSTEM, model: 'sonnet', extraArgs: ['--effort', 'low'], killAfterMs: 1500 });
  const m = await p;
  logResult('cancel:sigterm', m, { killedAfterDeltas: m.deltaCount, words: m.text.split(/\s+/).length });
  show('cancel', m);
  console.log('cancel: tFirstDelta', Math.round(m.tFirstDelta), 'tExit', Math.round(m.tExit), 'delta->exit ms', Math.round(m.tExit - m.tFirstDelta), '(kill was scheduled at +1500ms)', 'deltas before kill', m.deltaCount);
  await new Promise((r) => setTimeout(r, 500));
  let left = ''; try { left = execSync(`ps -p ${m.pid} -o pid= || true`).toString().trim(); } catch { /* gone */ }
  console.log('cancel: process still alive after exit event?', left ? 'YES ' + left : 'no');
  console.log('cancel: the model call was aborted; cost reported:', m.costUsd);
}
