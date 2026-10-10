// Opt-in quality check of the Mermaid Diagrams in generated lessons (#23) against the REAL Claude
// Code CLI: one lesson on `load-balancer` (Notion Outline written by hand, no outline call), one
// Remediation Lesson, one Protocol Step Lesson (high-level design). At most 4 CLI calls: the
// spare one goes to a diagram repair if a block fails the checks, else to the repair of a
// crafted lesson with two broken blocks (the lesson text itself is canned, no call).
//
//   node scripts/diagram-quality-check.ts [output.md] [--repair-only]
//
// `--repair-only` runs only the crafted repair (1 call) and appends it to the output.
//
// Every diagram is checked with `parseDiagramSource`, what the pipeline runs: `checkDiagramSource`
// then mermaid's own parser (parse only, no layout). Writes docs/samples/diagrams.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const repairOnly = args.includes('--repair-only')
const output = resolve(
  args.find((arg) => !arg.startsWith('--')) ?? resolve(root, 'docs/samples/diagrams.md')
)
const MAX_CALLS = 4

const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }
})
const load = (path: string) => vite.ssrLoadModule(`/src/${path}`)

const { loadCorpus, corpusPath } = (await load(
  'main/corpus/index.ts'
)) as typeof import('../src/main/corpus/index.ts')
const { openDatabase } = (await load(
  'main/db/driver.ts'
)) as typeof import('../src/main/db/driver.ts')
const { migrate } = (await load('main/db/migrate.ts')) as typeof import('../src/main/db/migrate.ts')
const { migrations } = (await load(
  'main/db/migrations/index.ts'
)) as typeof import('../src/main/db/migrations/index.ts')
const { createNotions, createTopic } = (await load(
  'main/db/repositories/learningContent.ts'
)) as typeof import('../src/main/db/repositories/learningContent.ts')
const { GenerationService } = (await load(
  'main/generation/service.ts'
)) as typeof import('../src/main/generation/service.ts')
const { runCli } = (await load(
  'main/generation/cliRunner.ts'
)) as typeof import('../src/main/generation/cliRunner.ts')
const pipelines = (await load(
  'main/generation/pipelines.ts'
)) as typeof import('../src/main/generation/pipelines.ts')
const prompts = (await load(
  'main/generation/prompts/index.ts'
)) as typeof import('../src/main/generation/prompts/index.ts')
const diagrams = (await load(
  'main/generation/diagrams.ts'
)) as typeof import('../src/main/generation/diagrams.ts')
const { checkDiagramSource, diagramNodeCount } = (await load(
  'shared/diagramSource.ts'
)) as typeof import('../src/shared/diagramSource.ts')

const corpus = loadCorpus(corpusPath(root))
const db = openDatabase(':memory:')
migrate(db, migrations)
const topic = createTopic(db, {
  slug: 'load-balancer',
  title: 'Load balancer',
  position: 1,
  sourceSection: 'load-balancer'
})
// Written by hand to save the outline call; shaped like a generated outline.
const notions = createNotions(db, [
  {
    topicId: topic.id,
    slug: 'load-balancer-role',
    title: 'Le rôle du load balancer',
    description:
      'Répartir les requêtes des clients entre plusieurs serveurs et éviter les serveurs en panne.',
    sourceSections: ['load-balancer']
  },
  {
    topicId: topic.id,
    slug: 'layer-4-vs-layer-7',
    title: 'Layer 4 et layer 7',
    description: 'Répartir selon les informations de transport ou selon le contenu de la requête.',
    sourceSections: ['load-balancer/layer-4-load-balancing', 'load-balancer/layer-7-load-balancing']
  },
  {
    topicId: topic.id,
    slug: 'horizontal-scaling',
    title: 'Le scaling horizontal',
    description: 'Ajouter des machines ordinaires derrière le load balancer, et ses inconvénients.',
    sourceSections: ['load-balancer/horizontal-scaling']
  }
])

/** A lesson with mistakes seen in LLM output: HTML in a label, an unsupported type. */
const CANNED_PROMPT = 'canned lesson with broken diagrams'
const cannedLesson = [
  '## Layer 7',
  '',
  'Le load balancer layer 7 lit le contenu de la requête pour choisir le serveur.',
  '',
  '```mermaid',
  'flowchart LR',
  '  C[Client] -->|requête| LB[Load balancer<br/>layer 7]',
  '  LB -->|/video| V[Serveurs vidéo]',
  '  LB -->|/billing| B[Serveurs facturation]',
  '```',
  '',
  'Le scaling horizontal ajoute des machines ordinaires derrière le load balancer.',
  '',
  '```mermaid',
  'mindmap',
  '  root((Scaling horizontal))',
  '    Moins cher',
  '    Meilleure disponibilité',
  '    Serveurs stateless',
  '```'
].join('\n')

let calls = 0
const timings: string[] = []
const service = new GenerationService({
  db,
  cli: { timeoutMs: 300_000 },
  runner: async (options) => {
    if (options.prompt === CANNED_PROMPT) {
      options.onEvent?.({ type: 'text_delta', text: cannedLesson })
      return {
        isError: false,
        subtype: 'success',
        text: cannedLesson,
        structuredOutput: undefined,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      }
    }
    if (++calls > MAX_CALLS) throw new Error(`Call budget of ${MAX_CALLS} exceeded.`)
    const started = Date.now()
    const result = await runCli(options)
    timings.push(
      `call ${calls} (${options.jsonSchema ? 'diagram repair' : 'text'}): ${((Date.now() - started) / 1000).toFixed(1)} s, ${result.outputTokens ?? '?'} output tokens`
    )
    console.log(timings.at(-1))
    return result
  }
})
const deps = { db, corpus, service }

interface Sample {
  title: string
  streamed: string
  final: string
  sources: string[]
}

async function run(
  title: string,
  request: Parameters<typeof service.generate>[0]
): Promise<Sample> {
  console.log(title)
  const generation = service.generate(request)
  let streamed = ''
  for await (const event of generation.events)
    if (event.type === 'text_delta') streamed += event.text
  const result = await generation.result
  return { title, streamed, final: result.content as string, sources: result.sourceSections }
}

async function report(sample: Sample): Promise<string> {
  const before = await diagrams.validateDiagramsInMarkdown(sample.streamed)
  const blocks = diagrams.findMermaidBlocks(sample.final)
  const lines = [
    `Diagrams: ${blocks.length}; invalid before repair: ${before.invalid.length}${before.invalid.length ? ` (${before.invalid.map((d) => `#${d.index} ${d.error.code}`).join(', ')})` : ''}; repaired: ${sample.streamed !== sample.final}; failures recorded: ${JSON.stringify(diagrams.findDiagramFailures(sample.final))}`,
    `Citations unknown: ${JSON.stringify(prompts.unknownCitations(sample.final, sample.sources))}; words: ${sample.final.split(/\s+/).length}`
  ]
  for (const block of blocks) {
    const check = checkDiagramSource(block.source)
    const parsed = await diagrams.parseDiagramSource(block.source)
    lines.push(
      `Diagram ${block.index}: ${check.ok ? check.type : 'invalid'}, parseDiagramSource ${parsed.ok ? 'ok' : `${parsed.code}: ${parsed.error}`}, nodes ${diagramNodeCount(block.source)}`
    )
  }
  return `## ${sample.title}

> [!info] Automatic checks
${lines.map((line) => `> - ${line}`).join('\n')}

${sample.final.replace(/^(#+) /gm, '$1## ')}
`
}

const cannedRequest = {
  kind: 'lesson' as const,
  input: { canned: true },
  prompt: { version: 'canned', system: 'canned', user: CANNED_PROMPT },
  finalize: diagrams.repairDiagrams
}

try {
  if (repairOnly) {
    const section = await report(
      await run('Repair: crafted lesson with two broken blocks', cannedRequest)
    )
    writeFileSync(
      output,
      `${readFileSync(output, 'utf8').trimEnd()}\n\n${section}\nRepair run: ${timings.join('; ')}.\n`
    )
    console.log(`Appended to ${output}`)
    process.exit(0)
  }
  const samples: Sample[] = []
  samples.push(await run('Lesson: Load balancer', await pipelines.prepareLesson(deps, topic.id)))
  samples.push(
    await run(
      'Remediation Lesson: layer-4-vs-layer-7 (concrete_example)',
      pipelines.prepareRemediationLesson(deps, notions[1]!.id, {
        angle: 'concrete_example',
        missedQuestionPrompts: [
          'Un load balancer doit envoyer les requêtes /video vers des serveurs dédiés. Quel type de load balancing faut-il ?'
        ]
      })
    )
  )
  const step = 'high_level_design'
  const stepBuild = prompts.buildProtocolStepLessonGeneration(step, {
    excerpts: prompts.protocolStepLessonExcerpts(
      step,
      (id) => corpus.findExcerpts({ sectionIds: [id], limit: 1 })[0]
    ),
    corpusVersion: corpus.data.metadata.commitSha
  })
  samples.push(await run('Protocol Step Lesson: high_level_design', stepBuild))
  if (calls < MAX_CALLS && samples.every((sample) => sample.streamed === sample.final)) {
    samples.push(await run('Repair: crafted lesson with two broken blocks', cannedRequest))
  }

  const sections = await Promise.all(samples.map(report))
  const note = `---
title: Sample diagrams in generated lessons
tags: [sample, prompts, diagrams]
issue: 23
generated: ${new Date().toISOString().slice(0, 10)}
prompt-versions: [${prompts.LESSON_PROMPT_VERSION}, ${prompts.REMEDIATION_LESSON_PROMPT_VERSION}, ${prompts.PROTOCOL_STEP_LESSON_PROMPT_VERSION}, ${diagrams.DIAGRAM_REPAIR_PROMPT_VERSION}]
corpus-commit: ${corpus.data.metadata.commitSha}
---

# Sample diagrams in generated lessons

Raw output of \`scripts/diagram-quality-check.ts\` (real CLI, default model and effort of the app). The review is in [[Prompts#Diagram quality review (2026-10-09)]]. Each diagram is checked with \`checkDiagramSource\` (the pipeline's validator) and with mermaid's own parser in Node (parse only, no layout). Primer excerpts: ${corpus.data.metadata.attribution}

CLI calls: ${calls}. ${timings.join('; ')}.

${sections.join('\n')}`
  writeFileSync(output, note)
  console.log(`Wrote ${output}`)
} finally {
  service.dispose()
  db.close()
  await vite.close()
}
