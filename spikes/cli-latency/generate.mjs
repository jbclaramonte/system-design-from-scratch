// Lesson / quiz generation timings and streaming granularity.
// Usage: node generate.mjs <lesson|quiz> <model> <runs> [schema|noschema] [parallel=1]
//   lesson: streamed Markdown (~600 words FR).  quiz: 5 questions JSON, 4 types.
//   schema: use --json-schema (CLI-enforced structured output). noschema: prompt-only + loose parse.
import { writeFileSync, mkdirSync } from 'node:fs';
import { runClaude, median, summarize, logResult } from './lib.mjs';
import { LESSON_PROMPT, LESSON_SYSTEM, QUIZ_PROMPT, QUIZ_SYSTEM, QUIZ_SCHEMA, validateQuiz, parseLooseJson } from './prompts.mjs';

const [kind = 'lesson', model = 'haiku', runsArg = '3', mode = 'schema', parArg = '1'] = process.argv.slice(2);
const runs = Number(runsArg), par = Number(parArg);
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });

// Extra CLI flags for experiments, e.g. SPIKE_EXTRA="--effort low"; SPIKE_TAG labels the run.
const extraArgs = (process.env.SPIKE_EXTRA ?? '').split(' ').filter(Boolean);
const tag = process.env.SPIKE_TAG ? `:${process.env.SPIKE_TAG}` : '';

function opts() {
  return { ...opts0(), extraArgs };
}
function opts0() {
  if (kind === 'lesson') return { prompt: LESSON_PROMPT, systemPrompt: LESSON_SYSTEM, model };
  const base = { prompt: QUIZ_PROMPT, systemPrompt: QUIZ_SYSTEM, model };
  if (mode === 'schema') return { ...base, jsonSchema: QUIZ_SCHEMA };
  return { ...base, prompt: QUIZ_PROMPT + ' Reply with a JSON object {"questions":[{"type","prompt","options","correct","explanation"}]} where correct is an array of option indexes. JSON only.' };
}

function analyse(m) {
  const gaps = m.deltaTimes.slice(1).map((t, i) => t - m.deltaTimes[i]);
  const row = {
    ...summarize(m),
    words: m.text.split(/\s+/).filter(Boolean).length,
    charsPerDelta: m.deltaCount ? +(m.text.length / m.deltaCount).toFixed(1) : null,
    medianGapMs: gaps.length ? +median(gaps).toFixed(1) : null,
    maxGapMs: gaps.length ? Math.round(Math.max(...gaps)) : null,
  };
  if (kind === 'quiz') {
    let value = m.structured ?? null, clean = value != null;
    if (value == null) ({ value, clean } = parseLooseJson(m.text || m.result || ''));
    row.jsonParsed = value != null; row.cleanJson = clean;
    row.schemaErrors = value ? validateQuiz(value) : ['unparseable'];
    row.valid = value != null && row.schemaErrors.length === 0;
    row.hasStructuredOutput = m.structured != null;
    m._value = value;
  }
  return row;
}

const label = `${kind}:${model}:${kind === 'quiz' ? mode : 'stream'}${par > 1 ? `:par${par}` : ''}${tag}`;
const all = [];
for (let i = 0; i < runs; i += par) {
  const batch = await Promise.all(Array.from({ length: Math.min(par, runs - i) }, () => runClaude(opts())));
  for (const [j, m] of batch.entries()) {
    const row = analyse(m);
    logResult(label, m, { words: row.words, charsPerDelta: row.charsPerDelta, medianGapMs: row.medianGapMs, maxGapMs: row.maxGapMs, valid: row.valid, cleanJson: row.cleanJson, schemaErrors: row.schemaErrors });
    writeFileSync(new URL(`./out/${label.replaceAll(':', '_')}_${i + j}.txt`, import.meta.url), m._value ? JSON.stringify(m._value, null, 2) : (m.text || m.result || m.stderr));
    all.push(row);
    console.log(label, i + j, JSON.stringify({ ...row, stderr: m.stderr.slice(0, 200) }));
  }
}
const med = (k) => { const v = median(all.map((r) => r[k])); return v == null ? 'n/a' : Math.round(v); };
console.log(`MEDIAN ${label}: init=${med('init')} firstDelta=${med('firstDelta')} lastDelta=${med('lastDelta')} result=${med('result')} exit=${med('exit')} words=${med('words')} deltas=${med('deltas')} outTok=${med('outTokens')}`);
if (kind === 'quiz') console.log(`VALID ${all.filter((r) => r.valid).length}/${all.length}`);
