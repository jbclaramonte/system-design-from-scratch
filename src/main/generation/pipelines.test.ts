import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Json } from '../../shared/generation'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import {
  flagQuestion,
  getQuestion,
  listQuestionHistory,
  listQuestions
} from '../db/repositories/assessment'
import { getCachedContent } from '../db/repositories/contentCache'
import { createNotions, createTopic, listNotionsByTopic } from '../db/repositories/learningContent'
import type { Topic } from '../db/types'
import { DEFAULT_TIMEOUT_MS, type CliCallOptions } from './cliRunner'
import {
  ensureNotionOutline,
  prepareLesson,
  prepareQuiz,
  prepareRemediationLesson,
  regenerateQuestion,
  saveQuiz,
  type PipelineDeps
} from './pipelines'
import { GenerationService, type CliRunner } from './service'
import {
  CACHE_SECTIONS,
  cacheOutline,
  fixtureCorpus,
  SCENARIO_DIAGRAM,
  validQuiz
} from './testing/contentFixtures'
import { installFakeCli, type FakeCli } from './testing/fakeCli'

const corpus = fixtureCorpus()

let db: Database
let cache: Topic

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  cache = createTopic(db, { slug: 'cache', title: 'Cache', position: 1, sourceSection: 'cache' })
})

afterEach(() => db.close())

/** Runner answering each structured Generation from the fixtures, by the prompt it gets. */
function fixtureRunner(calls: CliCallOptions[], quizzes: Json[] = [validQuiz()]): CliRunner {
  return async (options) => {
    calls.push(options)
    const outline = options.systemPrompt.includes('Notion Outline')
    const structuredOutput = outline
      ? cacheOutline
      : options.jsonSchema
        ? quizzes.shift()
        : undefined
    return {
      isError: false,
      subtype: 'success',
      text: structuredOutput ? '' : 'Leçon [source: cache]',
      structuredOutput,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    }
  }
}

function depsWith(runner: CliRunner): PipelineDeps & { service: GenerationService } {
  const service = new GenerationService({ db, runner, resolveCli: async () => '/x/claude' })
  return { db, corpus, service }
}

describe('Notion Outline', () => {
  it('is generated once, grounded on the topic sub-topics, and stored as notions', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(fixtureRunner(calls))

    const [a, b] = await Promise.all([
      ensureNotionOutline(deps, cache.id),
      ensureNotionOutline(deps, cache.id)
    ])

    expect(calls).toHaveLength(1)
    expect(calls[0]!.prompt).toContain('`cache/when-to-update-the-cache`: When to update the cache')
    expect(a).toEqual(b)
    expect(a.map((n) => n.slug)).toEqual(cacheOutline.notions.map((n) => n.slug))
    expect(a[1]).toMatchObject({
      title: 'Cache-aside (lazy loading)',
      sourceSections: ['cache/when-to-update-the-cache']
    })

    expect(await ensureNotionOutline(deps, cache.id)).toEqual(a)
    expect(calls).toHaveLength(1)
    deps.service.dispose()
  })

  it('refuses a grounded topic without a Source Corpus section', async () => {
    const deps = depsWith(fixtureRunner([]))
    const orphan = createTopic(db, { slug: 'orphan', title: 'Orphan', position: 2 })
    await expect(ensureNotionOutline(deps, orphan.id)).rejects.toThrow(/no Source Corpus section/)
  })
})

describe('lesson pipeline with the fake CLI', () => {
  let fake: FakeCli
  let service: GenerationService

  beforeEach(() => {
    fake = installFakeCli()
    service = new GenerationService({
      db,
      cli: { env: fake.env },
      resolveCli: async () => fake.bin
    })
    createNotions(
      db,
      cacheOutline.notions.map((notion) => ({ topicId: cache.id, ...notion }))
    )
  })

  afterEach(() => {
    service.dispose()
    fake.cleanup()
  })

  it('streams a grounded lesson and stores it in the Content Cache', async () => {
    const run = service.generate(await prepareLesson({ db, corpus, service }, cache.id))
    const deltas: string[] = []
    for await (const event of run.events) if (event.type === 'text_delta') deltas.push(event.text)
    const result = await run.result

    expect(deltas.join('')).toBe(result.content)
    expect(result).toMatchObject({ grounded: true, sourceSections: CACHE_SECTIONS })
    expect(getCachedContent(db, result.cacheKey!)?.kind).toBe('lesson')
    const [call] = fake.calls()
    expect(call!.stdin).toContain('Write the lesson on the topic "Cache"')
    expect(call!.argv).toContain('--system-prompt')
  })

  it('streams an ungrounded Foundations Module lesson', async () => {
    const http = createTopic(db, {
      slug: 'http',
      title: 'HTTP',
      position: 0,
      inFoundationsModule: true
    })
    createNotions(db, [{ topicId: http.id, slug: 'request-response', title: 'Requête et réponse' }])

    const result = await service.generate(await prepareLesson({ db, corpus, service }, http.id))
      .result

    expect(result).toMatchObject({ grounded: false, sourceSections: [] })
    expect(fake.calls()[0]!.stdin).toContain('Foundations Module')
  })
})

describe('quiz, remediation and flag-and-regenerate pipelines', () => {
  it('generates and saves a quiz with notion ids, answer keys and explanations', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(fixtureRunner(calls))

    const result = await deps.service.generate(await prepareQuiz(deps, cache.id)).result
    const quiz = saveQuiz(db, cache.id, result)

    expect(calls).toHaveLength(2) // outline, then quiz
    expect(calls[1]!.jsonSchema).toBeDefined()
    // No override: a hung quiz call fails with the runner's typed timeout after 120 s.
    expect(calls[1]!.timeoutMs ?? DEFAULT_TIMEOUT_MS).toBe(120_000)
    const notions = listNotionsByTopic(db, cache.id)
    const questions = listQuestions(db, quiz.id)
    expect(quiz).toMatchObject({ grounded: true, sourceSections: CACHE_SECTIONS })
    expect(questions.map((q) => q.type)).toEqual(validQuiz().questions.map((q) => q.type))
    expect(questions[2]!.notionIds).toEqual([notions[2]!.id, notions[1]!.id].sort((x, y) => x - y))
    expect(questions[0]!.body).toMatchObject({
      choices: expect.arrayContaining([{ text: 'Choix 2', correct: true }]),
      explanation: 'Côté client : OS ou navigateur.',
      sourceSections: ['cache/client-caching']
    })
    expect(questions[3]!.body).toHaveProperty('expectedPoints')
    // The Diagram is stored in the question body, as generated.
    expect(questions[2]!.body).toMatchObject({ diagram: SCENARIO_DIAGRAM })
    expect(questions[0]!.body).not.toHaveProperty('diagram')
    deps.service.dispose()
  })

  it('grounds a Remediation Lesson on the notion sections only', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(fixtureRunner(calls))
    const [, cacheAside] = await ensureNotionOutline(deps, cache.id)

    const request = prepareRemediationLesson(deps, cacheAside!.id, { angle: 'concrete_example' })
    const result = await deps.service.generate(request).result

    expect(request.finalize).toBeDefined() // Mermaid Diagram repair, see diagrams.test.ts

    expect(result).toMatchObject({
      grounded: true,
      sourceSections: ['cache/when-to-update-the-cache']
    })
    expect(calls[1]!.prompt).toContain('ONE realistic, concrete scenario')
    deps.service.dispose()
  })

  it('regenerates a flagged question with the same type, notions and position', async () => {
    const replacementQuiz = {
      questions: [
        {
          type: 'multiple_choice',
          prompt: 'Quelles étapes suit cache-aside sur un cache miss ?',
          notions: ['cache-aside'],
          sourceSections: ['cache/when-to-update-the-cache'],
          choices: [
            { text: 'Lire le stockage', correct: true },
            { text: 'Remplir le cache', correct: true },
            { text: 'Vider le cache', correct: false }
          ],
          diagram:
            'sequenceDiagram\n  participant A as Application\n  participant K as Cache\n  A->>K: lecture de la clé\n  K-->>A: absente',
          explanation: 'Lecture du stockage puis écriture dans le cache.'
        }
      ]
    }
    const calls: CliCallOptions[] = []
    const deps = depsWith(fixtureRunner(calls, [validQuiz(), replacementQuiz]))
    const quiz = saveQuiz(
      db,
      cache.id,
      await deps.service.generate(await prepareQuiz(deps, cache.id)).result
    )
    const faulty = listQuestions(db, quiz.id)[1]!
    await expect(regenerateQuestion(deps, faulty.id)).rejects.toThrow(/not flagged/)

    flagQuestion(db, faulty.id, 'Deux réponses semblent justes.')
    const replacement = await regenerateQuestion(deps, faulty.id)

    const prompt = calls.at(-1)!.prompt
    expect(prompt).toContain('flagged as faulty')
    expect(prompt).toContain('Deux réponses semblent justes.')
    expect(prompt).toContain(`- ${faulty.prompt}`) // previous prompts to avoid
    expect(prompt).toContain('Diagrams (optional `diagram` field')
    expect(replacement).toMatchObject({
      type: 'multiple_choice',
      position: faulty.position,
      notionIds: faulty.notionIds,
      prompt: 'Quelles étapes suit cache-aside sur un cache miss ?'
    })
    // A replacement question may carry a Diagram.
    expect(replacement.body).toMatchObject({ diagram: expect.stringContaining('sequenceDiagram') })
    expect(listQuestions(db, quiz.id)[1]!.id).toBe(replacement.id)
    expect(listQuestionHistory(db, quiz.id)).toHaveLength(7)
    expect(getQuestion(db, faulty.id)).toMatchObject({
      replacedByQuestionId: replacement.id,
      flagReason: 'Deux réponses semblent justes.'
    })
    await expect(regenerateQuestion(deps, faulty.id)).rejects.toThrow(/already replaced/)
    deps.service.dispose()
  })

  it('rejects a replacement that repeats the flagged prompt (one retry, then invalid_output)', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(fixtureRunner(calls, [validQuiz()]))
    const quiz = saveQuiz(
      db,
      cache.id,
      await deps.service.generate(await prepareQuiz(deps, cache.id)).result
    )
    const faulty = listQuestions(db, quiz.id)[0]!
    flagQuestion(db, faulty.id, null)
    const repeat = { questions: [validQuiz().questions[0]!] }
    const service = new GenerationService({
      db,
      runner: fixtureRunner(calls, [repeat, repeat]),
      resolveCli: async () => '/x/claude'
    })

    await expect(regenerateQuestion({ db, corpus, service }, faulty.id)).rejects.toMatchObject({
      code: 'invalid_output'
    })
    expect(calls.at(-1)!.prompt).toContain('already asked')
    expect(listQuestions(db, quiz.id)[0]!.id).toBe(faulty.id)
    service.dispose()
    deps.service.dispose()
  })
})
