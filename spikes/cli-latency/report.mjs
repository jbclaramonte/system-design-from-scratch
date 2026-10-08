// Aggregate results.jsonl into medians per label (ms from spawn). Usage: node report.mjs
import { readFileSync } from 'node:fs';
import { median } from './lib.mjs';
const rows = readFileSync(new URL('./results.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const groups = Map.groupBy(rows.filter((r) => r.exit != null && r.firstDelta != null), (r) => `${r.label} [${r.model}]`);
const f = (x) => (x == null ? '-' : Math.round(x));
console.log('label | n | init | firstDelta | lastDelta(≈total) | exit | words | outTok | $ | valid');
for (const [k, g] of groups) {
  const m = (key) => median(g.map((r) => r[key]));
  const valid = g.some((r) => r.valid !== undefined) ? `${g.filter((r) => r.valid).length}/${g.length}` : '';
  console.log(`${k} | ${g.length} | ${f(m('init'))} | ${f(m('firstDelta'))} | ${f(m('result'))} | ${f(m('exit'))} | ${f(m('words'))} | ${f(m('outTokens'))} | ${m('costUsd')?.toFixed(4)} | ${valid}`);
}
