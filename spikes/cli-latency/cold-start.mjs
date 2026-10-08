// Cold start / TTFT on a trivial prompt, naive flags vs isolated flags.
// Usage: node cold-start.mjs [runs=3] [model=haiku] [preset,preset]
import { runClaude, median, summarize, logResult } from './lib.mjs';
import { PING } from './prompts.mjs';

const runs = Number(process.argv[2] ?? 3);
const model = process.argv[3] ?? 'haiku';
const presets = (process.argv[4] ?? 'naive,isolated').split(',');

for (const preset of presets) {
  const rows = [];
  for (let i = 0; i < runs; i++) {
    const m = await runClaude({ prompt: PING, model, preset });
    const r = logResult(`cold-start:${preset}`, m);
    rows.push(r);
    console.log(preset, i, JSON.stringify({ ...r, text: m.text, stderr: m.stderr.slice(0, 200) }));
  }
  const med = (k) => Math.round(median(rows.map((r) => r[k])));
  console.log(`MEDIAN ${preset} ${model}: init=${med('init')}ms firstDelta=${med('firstDelta')}ms exit=${med('exit')}ms cacheCreate=${med('cacheCreate')} cacheRead=${med('cacheRead')}`);
}
