// Opt-in quality check of the Design Feedback prompts against the REAL Claude Code CLI, on the dev
// fixture exercise (the primer's Pastebin solution, exercise 1): the step feedback of a mediocre
// functional requirements submission, then a level 3 (near-solution) Hint on the same work, the
// level most likely to leak the Reference Solution. At most 2 CLI calls, drawn on the user's
// Claude plan; an automatic retry would exceed the budget and fails that call instead.
//
//   node scripts/design-feedback-check.ts [output.md]
//
// Default output: docs/samples/design-feedback.md. Read it and judge by hand.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Same loading as prompt-quality-check.ts: Vite's SSR loader handles the app's TypeScript.
const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }
})
const load = (path: string) => vite.ssrLoadModule(`/src/${path}`)

const { openDatabase } = (await load(
  'main/db/driver.ts'
)) as typeof import('../src/main/db/driver.ts')
const { migrate } = (await load('main/db/migrate.ts')) as typeof import('../src/main/db/migrate.ts')
const { migrations } = (await load(
  'main/db/migrations/index.ts'
)) as typeof import('../src/main/db/migrations/index.ts')
const { corpusPath, loadCorpus } = (await load(
  'main/corpus/index.ts'
)) as typeof import('../src/main/corpus/index.ts')
const { GenerationService } = (await load(
  'main/generation/service.ts'
)) as typeof import('../src/main/generation/service.ts')
const { runCli } = (await load(
  'main/generation/cliRunner.ts'
)) as typeof import('../src/main/generation/cliRunner.ts')
const prompts = (await load(
  'main/generation/prompts/designFeedback.ts'
)) as typeof import('../src/main/generation/prompts/designFeedback.ts')
const { createProtocolService, openDevProtocolExercise, DEV_PROTOCOL_PROBLEM_STATEMENT } =
  (await load('main/protocol/index.ts')) as typeof import('../src/main/protocol/index.ts')
const { PROTOCOL_STEP_DEFINITIONS } = (await load(
  'shared/protocol.ts'
)) as typeof import('../src/shared/protocol.ts')

const MAX_CALLS = 2
const output = resolve(process.argv[2] ?? resolve(root, 'docs/samples/design-feedback.md'))

// Mediocre on purpose: core use cases only, a solution and vague qualities mixed in, no
// expiration, no analytics, nothing out of scope, no question to the interviewer.
const submission = `- L'utilisateur colle du texte et reçoit un lien
- Avec le lien on peut voir le texte
- Il faut que ce soit rapide et scalable
- On utilise des microservices et une base NoSQL`

let calls = 0
const db = openDatabase(':memory:')
migrate(db, migrations)
const corpus = loadCorpus(corpusPath(root))
const service = new GenerationService({
  db,
  cli: { timeoutMs: 150_000 },
  runner: async (options) => {
    if (++calls > MAX_CALLS) throw new Error(`Call budget of ${MAX_CALLS} exceeded.`)
    return runCli(options)
  }
})
const protocol = createProtocolService({ db, corpus, service })
const exercise = openDevProtocolExercise(db, corpus, 1)
const step = 'functional_requirements' as const
const checklist = PROTOCOL_STEP_DEFINITIONS[step].checklist

const sections: string[] = []

let started = Date.now()
const outcome = await protocol.submitStep(exercise.id, step, { type: 'text', text: submission })
let seconds = ((Date.now() - started) / 1000).toFixed(1)
if (outcome.status === 'done' && outcome.value.feedback) {
  const feedback = outcome.value.feedback
  console.log(`Step feedback in ${seconds} s`)
  sections.push(
    [
      `## Step feedback (${seconds} s, prompt ${prompts.DESIGN_STEP_FEEDBACK_PROMPT_VERSION})`,
      `- Summary: ${feedback.summary}`,
      ...feedback.checklist.map(
        (entry, index) => `- ${checklist[index]!.id}: **${entry.verdict}**. ${entry.comment}`
      ),
      `- Gaps: ${feedback.gaps.join(' / ') || 'none'}`,
      `- Errors: ${feedback.errors.join(' / ') || 'none'}`,
      `- Forgotten trade-offs: ${feedback.forgottenTradeOffs.join(' / ') || 'none'}`,
      `- Next step: ${feedback.nextStep}`
    ].join('\n\n')
  )
} else {
  console.error('Step feedback failed', outcome)
  sections.push(
    `## Step feedback\n\nFailed: ${JSON.stringify(outcome.status === 'failed' ? outcome.error : outcome)}`
  )
}

// The level 3 Hint, built directly (the service would start at level 1).
const solution = corpus.getReferenceSolution('pastebin')!
const hint = prompts.buildHintGeneration({
  exercise: {
    title: exercise.title,
    problemStatement: DEV_PROTOCOL_PROBLEM_STATEMENT,
    referenceSolution: solution.markdown
  },
  step,
  level: 3,
  current: { type: 'text', text: submission },
  previousSteps: [],
  previousHints: []
})
started = Date.now()
try {
  const { content } = await service.generate({ ...hint, timeoutMs: prompts.DESIGN_HINT_TIMEOUT_MS })
    .result
  seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Hint in ${seconds} s`)
  sections.push(
    `## Level 3 Hint (${seconds} s, prompt ${hint.prompt.version})\n\n> ${content.hint}`
  )
} catch (error) {
  console.error('Hint failed', error)
  sections.push(`## Level 3 Hint\n\nFailed: ${String(error)}`)
}

const note = `---
title: Sample design feedback
tags: [sample, prompts, design-practice]
generated: ${new Date().toISOString().slice(0, 10)}
prompt-versions: [${prompts.DESIGN_STEP_FEEDBACK_PROMPT_VERSION}, ${prompts.DESIGN_HINT_PROMPT_VERSION}]
---

# Sample design feedback

Raw output of \`scripts/design-feedback-check.ts\` (real CLI, \`--model sonnet --effort low\`, ${calls} calls) on the dev fixture exercise (Pastebin Reference Solution, exercise 1). See [[Interview Protocol Implementation]] for the review.

## Problem statement

${DEV_PROTOCOL_PROBLEM_STATEMENT}

## Submission (functional requirements, mediocre on purpose)

\`\`\`text
${submission}
\`\`\`

${sections.join('\n\n')}
`
writeFileSync(output, note)
console.log(`Wrote ${output} (${calls} CLI calls)`)
service.dispose()
db.close()
await vite.close()
