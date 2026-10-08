// Prompts and schemas used by the spike. Content in French, repo text in English.

export const PING = 'Reply with the single word: ok';

export const LESSON_SYSTEM =
  'You are a system design teacher for a complete beginner. Write in French; keep technical terms in English (load balancer, cache, sharding...). Output only Markdown, no preamble.';

export const LESSON_PROMPT =
  'Write a lesson of 600 to 700 words in French Markdown on "Load balancers" for a complete beginner. ' +
  'Use a title, 3 or 4 "##" sections, one bullet list and one short example. No code blocks.';

export const QUIZ_SYSTEM =
  'You are a quiz generator for a system design course. Questions are in French; technical terms stay in English. Output only what is asked.';

export const QUIZ_PROMPT =
  'Generate a quiz of exactly 5 questions in French about "Load balancers" for a beginner. ' +
  'Use these 4 types, at least one of each: "single_choice" (4 options, 1 correct), "multiple_choice" (4 options, 2+ correct), ' +
  '"true_false", and "tags" (the learner selects which tags apply from a list of 6 candidate tags, some correct). ' +
  'Each question has an explanation.';

// JSON schema used with --json-schema and as the "contract" when we validate ourselves.
export const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'options', 'correct', 'explanation'],
        properties: {
          type: { enum: ['single_choice', 'multiple_choice', 'true_false', 'tags'] },
          prompt: { type: 'string' },
          // options for choice types, candidate tags for "tags", ["Vrai","Faux"] for true_false
          options: { type: 'array', items: { type: 'string' }, minItems: 2 },
          // indexes into options
          correct: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1 },
          explanation: { type: 'string' },
        },
      },
    },
  },
};

/** Minimal hand-rolled validator (no deps) for QUIZ_SCHEMA + semantic checks. */
export function validateQuiz(q) {
  const errs = [];
  if (!q || typeof q !== 'object' || !Array.isArray(q.questions)) return ['missing questions[]'];
  if (q.questions.length !== 5) errs.push(`expected 5 questions, got ${q.questions.length}`);
  const types = new Set();
  for (const [i, x] of q.questions.entries()) {
    for (const k of ['type', 'prompt', 'options', 'correct', 'explanation']) {
      if (!(k in x)) errs.push(`q${i}: missing ${k}`);
    }
    if (!['single_choice', 'multiple_choice', 'true_false', 'tags'].includes(x.type)) errs.push(`q${i}: bad type ${x.type}`);
    types.add(x.type);
    if (!Array.isArray(x.options) || !Array.isArray(x.correct)) { errs.push(`q${i}: options/correct not arrays`); continue; }
    if (x.correct.some((c) => !Number.isInteger(c) || c < 0 || c >= x.options.length)) errs.push(`q${i}: correct index out of range`);
    if (x.type === 'single_choice' && x.correct.length !== 1) errs.push(`q${i}: single_choice needs 1 correct`);
    if (x.type === 'true_false' && (x.options.length !== 2 || x.correct.length !== 1)) errs.push(`q${i}: true_false shape`);
  }
  if (types.size < 4) errs.push(`only ${types.size} distinct types`);
  return errs;
}

/** Extract JSON from free text (what we need to do without --json-schema). */
export function parseLooseJson(text) {
  const t = text.trim();
  try { return { value: JSON.parse(t), clean: true }; } catch { /* fall through */ }
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) ?? t.match(/(\{[\s\S]*\})/);
  if (m) { try { return { value: JSON.parse(m[1]), clean: false }; } catch { /* ignore */ } }
  return { value: null, clean: false };
}
