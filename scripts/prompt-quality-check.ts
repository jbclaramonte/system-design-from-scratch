// Opt-in quality check of the content prompts against the REAL Claude Code CLI, for one topic:
// Notion Outline, lesson, quiz (based on the lesson), one remediation lesson. At most 5 CLI calls
// (4 plus one automatic retry on invalid output), drawn on the user's Claude plan.
//
//   node scripts/prompt-quality-check.ts [topic-id] [output.md]
//
// Defaults: topic `cache`, output `docs/samples/<topic>.md`. Writes the outputs and automatic
// checks (citations, notion sections, quiz shape) as an Obsidian note to read and judge by hand.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The app sources use TypeScript syntax that Node cannot strip and extensionless imports: load
// them through Vite's SSR module loader, as the tests do.
const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null }
})
const load = (path: string) => vite.ssrLoadModule(`/src/main/${path}`)

const { loadCorpus, corpusPath } = (await load(
  'corpus/index.ts'
)) as typeof import('../src/main/corpus/index.ts')
const { openDatabase } = (await load('db/driver.ts')) as typeof import('../src/main/db/driver.ts')
const { migrate } = (await load('db/migrate.ts')) as typeof import('../src/main/db/migrate.ts')
const { migrations } = (await load(
  'db/migrations/index.ts'
)) as typeof import('../src/main/db/migrations/index.ts')
const { createTopic } = (await load(
  'db/repositories/learningContent.ts'
)) as typeof import('../src/main/db/repositories/learningContent.ts')
const { GenerationService } = (await load(
  'generation/service.ts'
)) as typeof import('../src/main/generation/service.ts')
const { runCli } = (await load(
  'generation/cliRunner.ts'
)) as typeof import('../src/main/generation/cliRunner.ts')
const pipelines = (await load(
  'generation/pipelines.ts'
)) as typeof import('../src/main/generation/pipelines.ts')
const prompts = (await load(
  'generation/prompts/index.ts'
)) as typeof import('../src/main/generation/prompts/index.ts')

const MAX_CALLS = 5
const topicId = process.argv[2] ?? 'cache'
const output = resolve(process.argv[3] ?? resolve(root, 'docs/samples', `${topicId}.md`))

const corpus = loadCorpus(corpusPath(root))
const section = corpus.getTopic(topicId)
if (!section) throw new Error(`Unknown corpus topic "${topicId}".`)

const db = openDatabase(':memory:')
migrate(db, migrations)
const topic = createTopic(db, {
  slug: section.id,
  title: section.title,
  position: 1,
  sourceSection: section.id
})

let calls = 0
const timings: string[] = []
const service = new GenerationService({
  db,
  cli: { timeoutMs: 300_000 },
  runner: async (options) => {
    if (++calls > MAX_CALLS) throw new Error(`Call budget of ${MAX_CALLS} exceeded.`)
    const started = Date.now()
    const result = await runCli(options)
    timings.push(
      `call ${calls}: ${((Date.now() - started) / 1000).toFixed(1)} s, ${result.outputTokens ?? '?'} output tokens`
    )
    console.log(timings.at(-1))
    return result
  }
})
const deps = { db, corpus, service }

try {
  console.log('1/4 Notion Outline')
  const notions = await pipelines.ensureNotionOutline(deps, topic.id)

  console.log('2/4 lesson')
  const lessonRun = service.generate(await pipelines.prepareLesson(deps, topic.id))
  const lesson = (await lessonRun.result).content
  const lessonSources = (await lessonRun.result).sourceSections

  console.log('3/4 quiz')
  const quizRequest = await pipelines.prepareQuiz(deps, topic.id, { lessonMarkdown: lesson })
  const quiz = (await service.generate(quizRequest).result).content

  // Remediation on the notion of the first scenario question (else the first tagged notion).
  const missed = quiz.questions.find((q) => q.type === 'scenario') ?? quiz.questions[0]!
  const notion = notions.find((n) => n.slug === missed.notions[0])!
  console.log(`4/4 remediation lesson on ${notion.slug}`)
  const remediationRun = service.generate(
    pipelines.prepareRemediationLesson(deps, notion.id, {
      angle: 'analogy',
      missedQuestionPrompts: [missed.prompt]
    })
  )
  const remediation = (await remediationRun.result).content
  const remediationSources = (await remediationRun.result).sourceSections

  const markers = prompts.findNotionMarkers(lesson)
  const checks = [
    `Lesson citations: ${prompts.findCitations(lesson).length} distinct ids, unknown: ${JSON.stringify(prompts.unknownCitations(lesson, lessonSources))}`,
    `Lesson notion markers in outline order: ${JSON.stringify(markers) === JSON.stringify(notions.map((n) => n.slug))} (${markers.join(', ')})`,
    `Lesson recap section: ${lesson.includes(`## ${prompts.RECAP_HEADING}`)}`,
    `Lesson words: ${lesson.split(/\s+/).length}`,
    `Quiz types: ${quiz.questions.map((q) => q.type).join(', ')}`,
    `Quiz notions covered: ${[...new Set(quiz.questions.flatMap((q) => q.notions))].length}/${notions.length}`,
    `Remediation citations unknown: ${JSON.stringify(prompts.unknownCitations(remediation, remediationSources))}`,
    `Remediation words: ${remediation.split(/\s+/).length}`,
    `CLI calls: ${calls}`,
    ...timings
  ]

  const quizMarkdown = quiz.questions
    .map((q, i) => {
      const head = `### Q${i + 1}. ${q.type} (${q.notions.join(', ')})\n\n${'scenario' in q ? `*${q.scenario}*\n\n` : ''}${q.prompt}\n`
      const sources = `\nSources: ${q.sourceSections.join(', ')}`
      if (q.type === 'free_answer') {
        return `${head}\nExpected points:\n${q.expectedPoints.map((p) => `- ${p}`).join('\n')}\n\nModel answer: ${q.modelAnswer}\n${sources}`
      }
      return `${head}\n${q.choices.map((c) => `- [${c.correct ? 'x' : ' '}] ${c.text}`).join('\n')}\n\nExplanation: ${q.explanation}\n${sources}`
    })
    .join('\n\n')

  const note = `---
title: Sample content for ${section.title}
tags: [sample, prompts]
topic: ${section.id}
generated: ${new Date().toISOString().slice(0, 10)}
prompt-versions: [${prompts.NOTION_OUTLINE_PROMPT_VERSION}, ${prompts.LESSON_PROMPT_VERSION}, ${prompts.QUIZ_PROMPT_VERSION}, ${prompts.REMEDIATION_LESSON_PROMPT_VERSION}]
corpus-commit: ${corpus.data.metadata.commitSha}
---

# Sample content for ${section.title}

Raw output of \`scripts/prompt-quality-check.ts\` (real CLI, \`--model sonnet --effort low\`). See [[Prompts]] for the review. Primer excerpts: ${corpus.data.metadata.attribution}

> [!info] Automatic checks
${checks.map((check) => `> - ${check}`).join('\n')}

## Notion Outline

| Slug | Title | Description | Sources |
|---|---|---|---|
${notions.map((n) => `| \`${n.slug}\` | ${n.title} | ${n.description ?? ''} | ${n.sourceSections.join(', ')} |`).join('\n')}

## Lesson

${lesson.replace(/^(#+) /gm, '$1## ')}

## Quiz

${quizMarkdown}

## Remediation Lesson (\`${notion.slug}\`, angle: analogy)

${remediation.replace(/^(#+) /gm, '$1## ')}
`
  writeFileSync(output, note)
  console.log(`Wrote ${output}\n${checks.join('\n')}`)
} finally {
  service.dispose()
  db.close()
  await vite.close()
}
