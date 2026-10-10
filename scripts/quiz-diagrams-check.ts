// Opt-in quality check of the quiz Diagrams (#24) against the REAL Claude Code CLI: one quiz on
// the cache topic, grounded on the primer, from the Notion Outline and the lesson of the cache
// sample (docs/samples/cache.md), so no outline or lesson call is spent. At most 3 CLI calls
// (the quiz plus its automatic retries), drawn on the user's Claude plan.
//
//   node scripts/quiz-diagrams-check.ts [output.md] [--max-calls=N] [--dry-run]
//
// `--dry-run` makes no call: it prints the prompt and JSON schema sizes. Each real call is run
// through a bash wrapper that copies the CLI's raw stream-json output to a temp log, summarized
// per call (turns, content block types, stop reason, `num_turns`, durations, usage).
//
// Default output: docs/samples/quiz-diagrams.md. Every Diagram is written as a ```mermaid block
// with the automatic checks (source checks, node count, answer leak); judge the rest by hand
// (useful, answerable from the lesson, not giving the answer away), and draw them in the app.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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
const { DEFAULT_TIMEOUT_MS, runCli } = (await load(
  'main/generation/cliRunner.ts'
)) as typeof import('../src/main/generation/cliRunner.ts')
const { z } = (await vite.ssrLoadModule('zod')) as typeof import('zod')
const pipelines = (await load(
  'main/generation/pipelines.ts'
)) as typeof import('../src/main/generation/pipelines.ts')
const prompts = (await load(
  'main/generation/prompts/index.ts'
)) as typeof import('../src/main/generation/prompts/index.ts')
const diagrams = (await load(
  'shared/diagramSource.ts'
)) as typeof import('../src/shared/diagramSource.ts')

const args = process.argv.slice(2)
const maxCallsArg = args.find((arg) => arg.startsWith('--max-calls='))
const MAX_CALLS = Math.min(3, Number(maxCallsArg?.split('=')[1] ?? 3))
const dryRun = args.includes('--dry-run')
const positional = args.filter((arg) => !arg.startsWith('--'))
const output = resolve(positional[0] ?? resolve(root, 'docs/samples/quiz-diagrams.md'))

// The Notion Outline table and the lesson of the cache sample.
const sample = readFileSync(resolve(root, 'docs/samples/cache.md'), 'utf8')
const between = (start: string, end: string) =>
  sample.slice(sample.indexOf(start) + start.length, sample.indexOf(end))
const outline = between('## Notion Outline', '## Lesson')
  .split('\n')
  .filter((line) => line.startsWith('| `'))
  .map((line) => {
    const [slug, title, description, sources] = line.split(' | ').map((cell) => cell.trim())
    return {
      slug: slug!.replace(/^\| `|`$/g, ''),
      title: title!,
      description: description!,
      sourceSections: sources!.replace(/ \|$/, '').split(', ')
    }
  })
// The sample demotes the lesson headings by one level: restore them.
const lesson = between('## Lesson', '## Quiz')
  .trim()
  .replace(/^#(#+) /gm, '$1 ')

const corpus = loadCorpus(corpusPath(root))
const section = corpus.getTopic('cache')!
const db = openDatabase(':memory:')
migrate(db, migrations)
const topic = createTopic(db, {
  slug: section.id,
  title: section.title,
  position: 1,
  sourceSection: section.id
})
createNotions(
  db,
  outline.map((notion) => ({ ...notion, topicId: topic.id }))
)

// Copies the CLI's stdout to a log while it runs; `exec` keeps signals going to the CLI itself.
const logDir = mkdtempSync(join(tmpdir(), 'quiz-diagrams-'))
const tee = join(logDir, 'claude-tee.sh')
writeFileSync(tee, '#!/bin/bash\nexec "$REAL_CLAUDE" "$@" > >(tee "$RAW_LOG")\n')
chmodSync(tee, 0o755)

/** One line on a call's raw stream: what the CLI did between the prompt and the result. */
function summarizeRaw(path: string): string {
  /** A nested field of a parsed event, or undefined. */
  const get = (value: unknown, ...keys: string[]): unknown =>
    keys.reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value
    )
  const events: unknown[] = readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown]
      } catch {
        return []
      }
    })
  const inner = events.filter((e) => get(e, 'type') === 'stream_event').map((e) => get(e, 'event'))
  const ofType = (type: string) => inner.filter((e) => get(e, 'type') === type)
  const blocks = ofType('content_block_start').map((e) =>
    [get(e, 'content_block', 'type'), get(e, 'content_block', 'name')].filter(Boolean).join(':')
  )
  const stops = ofType('message_delta').map((e) => get(e, 'delta', 'stop_reason'))
  const result = events.find((e) => get(e, 'type') === 'result')
  return `messages ${ofType('message_start').length}, blocks [${blocks.join(', ')}], stop reasons [${stops.join(', ')}], num_turns ${String(get(result, 'num_turns'))}, duration ${String(get(result, 'duration_ms'))} ms (api ${String(get(result, 'duration_api_ms'))} ms), usage ${JSON.stringify(get(result, 'usage') ?? null)}, is_error ${String(get(result, 'is_error'))}`
}

let calls = 0
const timings: string[] = []
const retries: string[] = []
const service = new GenerationService({
  db,
  // The app's timeout (no override), so a hung call fails as it would in the app.
  runner: async (options) => {
    // A retry carries why the previous output was refused: keep it, even past the budget.
    const refused = /Your previous output was invalid:\n([\s\S]*?)\nGenerate it again/.exec(
      options.prompt
    )?.[1]
    if (refused) {
      retries.push(refused)
      console.log(`refused output: ${refused}`)
    }
    if (++calls > MAX_CALLS) throw new Error(`Call budget of ${MAX_CALLS} exceeded.`)
    const started = Date.now()
    const seen: Record<string, number> = {}
    const at = (name: string) => (seen[name] ??= Date.now() - started)
    const rawLog = join(logDir, `call-${calls}.ndjson`)
    const report = (outcome: string) => {
      const raw = (() => {
        try {
          return summarizeRaw(rawLog)
        } catch {
          return 'no raw output'
        }
      })()
      timings.push(
        `call ${calls}: ${outcome} after ${((Date.now() - started) / 1000).toFixed(1)} s (first event ${seen['init'] ?? '-'} ms, first JSON ${seen['json_delta'] ?? '-'} ms, first text ${seen['text_delta'] ?? '-'} ms, timeout ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms); raw: ${raw}`
      )
      console.log(timings.at(-1))
    }
    try {
      const result = await runCli({
        ...options,
        bin: tee,
        env: { ...(options.env ?? process.env), REAL_CLAUDE: options.bin, RAW_LOG: rawLog },
        onEvent: (event) => {
          at(event.type)
          options.onEvent?.(event)
        }
      })
      report(`${result.outputTokens ?? '?'} output tokens`)
      return result
    } catch (error) {
      report(`failed (${(error as Error).message})`)
      throw error
    }
  }
})

try {
  console.log(`quiz on ${section.id} (${outline.length} notions, lesson of ${lesson.length} chars)`)
  const request = await pipelines.prepareQuiz({ db, corpus, service }, topic.id, {
    lessonMarkdown: lesson
  })
  const schema = JSON.stringify(z.toJSONSchema(request.schema!, { target: 'draft-7' }))
  console.log(
    `prompt ${request.prompt.user.length} + system ${request.prompt.system.length} chars, JSON schema ${schema.length} chars (${schema.match(/"enum"/g)?.length ?? 0} enums, ${schema.match(/"properties"/g)?.length ?? 0} objects), diagram rules ${prompts.QUIZ_DIAGRAM_RULES.length} chars, version ${request.prompt.version}`
  )
  if (dryRun) process.exit(0)
  const quiz = (await service.generate(request).result).content

  const withDiagram = quiz.questions.filter((q) => 'diagram' in q && q.diagram)
  const checks = [
    `Quiz types: ${quiz.questions.map((q) => q.type).join(', ')}`,
    `Questions with a diagram: ${withDiagram.length}/${quiz.questions.length} (${withDiagram.map((q) => q.type).join(', ')})`,
    `CLI calls: ${calls} (more than 1 means the first output was refused)`,
    ...retries.map((reason, i) => `Refused output ${i + 1}: ${reason.replace(/\n/g, ' / ')}`),
    ...timings
  ]

  const questionMarkdown = quiz.questions
    .map((q, i) => {
      const head = `### Q${i + 1}. ${q.type} (${q.notions.join(', ')})\n\n${'scenario' in q ? `*${q.scenario}*\n\n` : ''}${q.prompt}\n`
      if (q.type === 'free_answer') {
        return `${head}\nExpected points:\n${q.expectedPoints.map((p) => `- ${p}`).join('\n')}\n\nModel answer: ${q.modelAnswer}`
      }
      let diagram = ''
      if (q.diagram) {
        const check = diagrams.checkDiagramSource(q.diagram)
        const leak = prompts.diagramAnswerLeak(q.diagram, q.choices)
        diagram = `\n\`\`\`mermaid\n${q.diagram}\n\`\`\`\n\n> [!info] Diagram checks\n> - Source checks: ${check.ok ? `ok (${check.type})` : check.error.message}\n> - Nodes: ${diagrams.diagramNodeCount(q.diagram)}\n> - Answer leak: ${leak ?? 'none found'}\n`
      }
      return `${head}${diagram}\n${q.choices.map((c) => `- [${c.correct ? 'x' : ' '}] ${c.text}`).join('\n')}\n\nExplanation: ${q.explanation}\n\nSources: ${q.sourceSections.join(', ')}`
    })
    .join('\n\n')

  const note = `---
title: Sample quiz with Diagrams
tags: [sample, prompts, diagrams]
topic: ${section.id}
generated: ${new Date().toISOString().slice(0, 10)}
prompt-versions: [${prompts.QUIZ_PROMPT_VERSION}]
corpus-commit: ${corpus.data.metadata.commitSha}
---

# Sample quiz with Diagrams

Raw output of \`scripts/quiz-diagrams-check.ts\` (real CLI, \`--model sonnet --effort low\`): one quiz on the cache topic, from the Notion Outline and the lesson of [[samples/cache|the cache sample]]. See [[Quiz Engine#Quiz Diagrams quality review]] for the review. Primer excerpts: ${corpus.data.metadata.attribution}

> [!info] Automatic checks
${checks.map((check) => `> - ${check}`).join('\n')}

## Quiz

${questionMarkdown}
`
  writeFileSync(output, note)
  console.log(`Wrote ${output}\n${checks.join('\n')}`)
} finally {
  service.dispose()
  db.close()
  await vite.close()
}
