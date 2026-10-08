// Minimal demo: stream a lesson token by token to the terminal.
// Usage: node stream-demo.mjs [model=sonnet] ["custom prompt"]
import { runClaude } from './lib.mjs';
import { LESSON_PROMPT, LESSON_SYSTEM } from './prompts.mjs';

const model = process.argv[2] ?? 'sonnet';
const prompt = process.argv[3] ?? LESSON_PROMPT;
const t0 = performance.now();
let first = true;
const m = await runClaude({
  prompt, model, systemPrompt: LESSON_SYSTEM, extraArgs: ['--effort', 'low'],
  onDelta: (d) => {
    if (first) { first = false; process.stderr.write(`[first token after ${Math.round(performance.now() - t0)}ms]\n`); }
    process.stdout.write(d); // in Electron: ipcMain -> webContents.send('lesson:delta', d)
  },
});
process.stderr.write(`\n[done: ${m.deltaCount} deltas, result at ${Math.round(m.tResult)}ms, exit ${m.exitCode}]\n`);
