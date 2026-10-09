// Opt-in quality check of the two first Design Exercises against the REAL Claude Code CLI: for
// Pastebin (exercise 1) and the Twitter timeline (exercise 2, run twice: it leaked most), the
// step feedback of a mediocre functional requirements submission, run through the Interview
// Protocol service as the app does (leak guard retry included). At most 6 CLI calls, drawn on the
// user's Claude plan; a call over budget fails instead.
//
// Leak metric: the curated Reference Solution terms of the step (`referenceTerms` of
// designExercises.ts) found in a feedback but not in the submission, problem statement or title,
// over the number of terms. Measured on every CLI output (before the guard) and on the stored
// feedback (after it). Limits in docs/Interview Protocol Implementation.md.
//
//   node scripts/design-exercises-check.ts [output.md]
//
// Default output: docs/samples/design-exercises.md. Read it and judge by hand.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Same loading as design-feedback-check.ts: Vite's SSR loader handles the app's TypeScript.
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
const { listDesignExercises, listDesignFeedback } = (await load(
  'main/db/repositories/designPractice.ts'
)) as typeof import('../src/main/db/repositories/designPractice.ts')
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
const {
  createProtocolService,
  DESIGN_EXERCISES,
  findLeakedTerms,
  seedDesignExercises,
  stepFeedbackTexts
} = (await load('main/protocol/index.ts')) as typeof import('../src/main/protocol/index.ts')
const { PROTOCOL_STEP_DEFINITIONS } = (await load(
  'shared/protocol.ts'
)) as typeof import('../src/shared/protocol.ts')

const MAX_CALLS = 6
const output = resolve(process.argv[2] ?? resolve(root, 'docs/samples/design-exercises.md'))

// Mediocre on purpose: core use cases only, vague qualities and design choices mixed in, nothing
// out of scope, no question to the interviewer.
const SUBMISSIONS: Record<string, string> = {
  pastebin: `- L'utilisateur colle du texte et obtient un lien
- On peut ouvrir le lien pour lire le texte
- Le site doit être rapide
- On stocke tout dans une base de données`,
  twitter: `- Un utilisateur peut poster un tweet
- Il voit les tweets des gens qu'il suit
- On peut liker et retweeter
- Il faut que ça tienne des millions d'utilisateurs`
}

let calls = 0
const corpus = loadCorpus(corpusPath(root))
const step = 'functional_requirements' as const
const checklist = PROTOCOL_STEP_DEFINITIONS[step].checklist
const seconds = (started: number) => ((Date.now() - started) / 1000).toFixed(1)
const RUNS = ['pastebin', 'twitter', 'twitter']
const metrics: string[] = []

const sections: string[] = []
for (const [run, slug] of RUNS.entries()) {
  const definition = DESIGN_EXERCISES.find((exercise) => exercise.slug === slug)!
  const terms = definition.referenceTerms[step] ?? []
  const submission = SUBMISSIONS[slug]!
  const allowed = [definition.title, definition.problemStatement, submission].join('\n')
  const rawLeaks: string[][] = []
  // A fresh database per run: the repeat is a first submission too.
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  seedDesignExercises(db, corpus)
  const service = new GenerationService({
    db,
    cli: { timeoutMs: 150_000 },
    runner: async (options) => {
      if (++calls > MAX_CALLS) throw new Error(`Call budget of ${MAX_CALLS} exceeded.`)
      const result = await runCli(options)
      const output = result.structuredOutput as Parameters<typeof stepFeedbackTexts>[0] | null
      if (output?.checklist)
        rawLeaks.push(findLeakedTerms(stepFeedbackTexts(output), allowed, terms))
      return result
    }
  })
  const protocol = createProtocolService({ db, corpus, service })
  const exercise = listDesignExercises(db).find((row) => row.slug === slug)!
  const part = [
    `## Run ${run + 1}: exercise ${definition.orderIndex}, ${definition.title}`,
    `Problem statement shown to the learner:\n\n> ${definition.problemStatement}`,
    `Submission (functional requirements, mediocre on purpose):\n\n\`\`\`text\n${submission}\n\`\`\``
  ]
  const started = Date.now()
  const outcome = await protocol.submitStep(exercise.id, step, { type: 'text', text: submission })
  if (outcome.status === 'done' && outcome.value.feedback) {
    const feedback = outcome.value.feedback
    const final = findLeakedTerms(stepFeedbackTexts(feedback), allowed, terms)
    const record = listDesignFeedback(db, exercise.id)[0]!.content as { leakCheck?: unknown }
    const line = `| ${run + 1} | ${slug} | ${rawLeaks.map((l) => `${l.length}/${terms.length} (${l.join(', ') || 'none'})`).join(' then ')} | ${final.length}/${terms.length} (${final.join(', ') || 'none'}) | ${rawLeaks.length} |`
    metrics.push(line)
    console.log(line)
    part.push(
      `### Step feedback (${seconds(started)} s, ${rawLeaks.length} CLI call(s))`,
      `Leak check stored with the feedback: \`${JSON.stringify(record.leakCheck)}\``,
      [
        `- Summary: ${feedback.summary}`,
        ...feedback.checklist.map(
          (entry, index) => `- ${checklist[index]!.id}: **${entry.verdict}**. ${entry.comment}`
        ),
        `- Gaps: ${feedback.gaps.join(' / ') || 'none'}`,
        `- Errors: ${feedback.errors.join(' / ') || 'none'}`,
        `- Forgotten trade-offs: ${feedback.forgottenTradeOffs.join(' / ') || 'none'}`,
        `- Next step: ${feedback.nextStep}`
      ].join('\n')
    )
  } else {
    console.error(`${slug}: step feedback failed`, outcome)
    part.push(
      `### Step feedback\n\nFailed: ${JSON.stringify(outcome.status === 'failed' ? outcome.error : outcome)}`
    )
  }
  sections.push(part.join('\n\n'))
  service.dispose()
  db.close()
}

const note = `---
title: Sample Design Exercises feedback
tags: [sample, prompts, design-practice]
generated: ${new Date().toISOString().slice(0, 10)}
prompt-versions: [${prompts.DESIGN_STEP_FEEDBACK_PROMPT_VERSION}]
---

# Sample Design Exercises feedback

Raw output of \`scripts/design-exercises-check.ts\` (real CLI, \`--model sonnet --effort low\`, ${calls} calls) on the first two [[Design Exercises]]: the step feedback of a mediocre functional requirements submission, with the leak guard. See [[Design Exercises#Quality review]] for the review.

## Leak metric

Reference terms named by the feedback but absent from the submission, statement and title (curated terms, see [[Interview Protocol Implementation#Leak guard]]).

| Run | Exercise | Each CLI output | Stored feedback | Calls |
|---|---|---|---|---|
${metrics.join('\n')}

${sections.join('\n\n')}
`
writeFileSync(output, note)
console.log(`Wrote ${output} (${calls} CLI calls)`)
await vite.close()
