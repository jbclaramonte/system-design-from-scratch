// The Generation Language through the pipelines and the Content Cache: French keys are the legacy
// ones, each language has its own entries, and switching the language never deletes or overwrites
// the other language's content.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Json } from '../../shared/generation'
import { generationLanguages, type GenerationLanguage } from '../../shared/generationLanguage'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { flagQuestion, listQuestions } from '../db/repositories/assessment'
import {
  contentCacheKey,
  getCachedContent,
  putCachedContent
} from '../db/repositories/contentCache'
import { createNotions, createTopic, getNotion } from '../db/repositories/learningContent'
import { getGenerationLanguage, updateSettings } from '../db/repositories/settings'
import type { Topic } from '../db/types'
import type { CliCallOptions } from './cliRunner'
import {
  ensureNotionOutline,
  prepareLesson,
  prepareQuiz,
  prepareRemediationLesson,
  regenerateQuestion,
  saveQuiz,
  type PipelineDeps
} from './pipelines'
import { languageRules } from './prompts'
import { GenerationService, type CliRunner } from './service'
import { cacheOutline, fixtureCorpus, validQuiz } from './testing/contentFixtures'

const corpus = fixtureCorpus()

let db: Database
let cache: Topic

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
  cache = createTopic(db, { slug: 'cache', title: 'Cache', position: 1, sourceSection: 'cache' })
  createNotions(
    db,
    cacheOutline.notions.map((notion) => ({ topicId: cache.id, ...notion }))
  )
})

afterEach(() => db.close())

/** The language a CLI call was asked for: the language rules its system prompt carries. */
const languageOf = (call: CliCallOptions): GenerationLanguage | undefined =>
  generationLanguages.find((language) => call.systemPrompt.includes(languageRules(language)))

function runnerOf(calls: CliCallOptions[]): CliRunner {
  return async (options) => {
    calls.push(options)
    const structuredOutput = options.jsonSchema ? (validQuiz() as Json) : undefined
    return {
      isError: false,
      subtype: 'success',
      text: structuredOutput ? '' : `Lesson written for call ${calls.length} [source: cache]`,
      structuredOutput,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    }
  }
}

function depsWith(calls: CliCallOptions[]): PipelineDeps {
  const service = new GenerationService({
    db,
    runner: runnerOf(calls),
    resolveCli: async () => '/x/claude'
  })
  return { db, corpus, service }
}

const cacheRows = () =>
  db
    .prepare(
      'SELECT cache_key AS key, language, content FROM content_cache ORDER BY created_at, key'
    )
    .all<{ key: string; language: string; content: string }>()

describe('Content Cache key', () => {
  const inputs = { topic: 'cache' }
  /** What the key was before the Generation Language existed: kind, inputs and version only. */
  const legacyKey = createHash('sha256')
    .update('{"inputs":{"topic":"cache"},"kind":"lesson","promptVersion":"lesson-4"}')
    .digest('hex')

  it('keeps the French key it had before English existed, so French content is reused', () => {
    expect(contentCacheKey('lesson', inputs, 'lesson-4', 'fr')).toBe(legacyKey)
    // The literal, so a refactor of the key cannot silently move every French entry.
    expect(legacyKey).toBe('b17246e680536cba2e30481c9eb17dab5f7b30fb8a0529ef5a7e42fb27f499a8')
  })

  it('gives English its own key, for every cached kind', () => {
    for (const kind of [
      'lesson',
      'remediation_lesson',
      'quiz',
      'protocol_step_lesson',
      'question_clarification'
    ] as const) {
      expect(contentCacheKey(kind, inputs, 'v1', 'en')).not.toBe(
        contentCacheKey(kind, inputs, 'v1', 'fr')
      )
    }
  })

  it('stores a French and an English entry side by side, each with its language', () => {
    const entry = { kind: 'lesson', inputs, promptVersion: 'lesson-4', grounded: false } as const
    const fr = putCachedContent(db, { ...entry, language: 'fr', content: 'Bonjour' })
    const en = putCachedContent(db, { ...entry, language: 'en', content: 'Hello' })

    expect(fr.cacheKey).not.toBe(en.cacheKey)
    expect(getCachedContent(db, fr.cacheKey)).toMatchObject({ language: 'fr', content: 'Bonjour' })
    expect(getCachedContent(db, en.cacheKey)).toMatchObject({ language: 'en', content: 'Hello' })
  })
})

describe('GenerationService and the language', () => {
  const request = (language: GenerationLanguage) => ({
    kind: 'lesson' as const,
    language,
    input: { topic: 'cache' },
    prompt: { version: 'v1', system: 'system', user: 'user' }
  })

  it('does not serve a French entry for English, nor an English one for French', async () => {
    let calls = 0
    const service = new GenerationService({
      db,
      resolveCli: async () => '/x/claude',
      runner: async () => ({
        isError: false,
        subtype: 'success',
        text: `text ${++calls}`,
        structuredOutput: undefined,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    })

    const fr = await service.generate(request('fr')).result
    expect(calls).toBe(1)
    const en = await service.generate(request('en')).result
    expect(calls).toBe(2) // the French entry was not served for English
    expect(en.fromCache).toBe(false)
    expect(en.cacheKey).not.toBe(fr.cacheKey)

    // Each is now cached on its own, and the other one is untouched.
    const frAgain = await service.generate(request('fr')).result
    const enAgain = await service.generate(request('en')).result
    expect(calls).toBe(2)
    expect([frAgain.content, enAgain.content]).toEqual(['text 1', 'text 2'])
    expect([frAgain.fromCache, enAgain.fromCache]).toEqual([true, true])
    expect(
      cacheRows()
        .map((row) => row.language)
        .sort()
    ).toEqual(['en', 'fr'])
    service.dispose()
  })
})

describe('pipelines and the Generation Language setting', () => {
  it('reads the setting when preparing a request, French by default', async () => {
    const deps = depsWith([])
    expect(getGenerationLanguage(db)).toBe('fr')

    const fr = await prepareLesson(deps, cache.id)
    updateSettings(db, { generationLanguage: 'en' })
    const en = await prepareLesson(deps, cache.id)

    expect([fr.language, en.language]).toEqual(['fr', 'en'])
    expect(fr.prompt.system).toContain(languageRules('fr'))
    expect(en.prompt.system).toContain(languageRules('en'))
    expect(en.prompt.system).not.toContain(languageRules('fr'))
    expect(fr.input).toEqual(en.input) // only the language differs: it is in the key
    deps.service.dispose()
  })

  it('lets a caller choose the language, whatever the setting is', async () => {
    const deps = depsWith([])
    updateSettings(db, { generationLanguage: 'en' })

    const quiz = await prepareQuiz(deps, cache.id, {}, { language: 'fr' })
    const notion = getNotion(db, listNotionIds()[0]!)!
    const remediation = prepareRemediationLesson(
      deps,
      notion.id,
      { angle: 'analogy' },
      { language: 'fr' }
    )
    expect([quiz.language, remediation.language]).toEqual(['fr', 'fr'])
    expect(remediation.prompt.system).toContain(languageRules('fr'))
    deps.service.dispose()
  })

  const listNotionIds = () =>
    db
      .prepare('SELECT id FROM notions ORDER BY id')
      .all<{ id: number }>()
      .map((row) => row.id)

  it('generates and keeps a lesson in each language: switching deletes and overwrites nothing', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(calls)

    const french = await deps.service.generate(await prepareLesson(deps, cache.id)).result
    updateSettings(db, { generationLanguage: 'en' })
    const english = await deps.service.generate(await prepareLesson(deps, cache.id)).result
    expect(calls.map(languageOf)).toEqual(['fr', 'en'])
    const before = cacheRows()
    expect(before).toHaveLength(2)

    // Switch back: the first lesson is served from the cache, nothing is generated again.
    updateSettings(db, { generationLanguage: 'fr' })
    const again = await deps.service.generate(await prepareLesson(deps, cache.id)).result
    expect(again.fromCache).toBe(true)
    expect(again.content).toBe(french.content)
    expect(calls).toHaveLength(2)
    expect(cacheRows()).toEqual(before)
    expect(getCachedContent(db, english.cacheKey!)?.content).toBe(english.content)
    deps.service.dispose()
  })

  it('changing the setting touches no stored content', async () => {
    const deps = depsWith([])
    await deps.service.generate(await prepareLesson(deps, cache.id)).result
    const before = cacheRows()

    updateSettings(db, { generationLanguage: 'en' })
    updateSettings(db, { generationLanguage: 'fr' })

    expect(cacheRows()).toEqual(before)
    deps.service.dispose()
  })

  it('generates the Notion Outline in the language it is first needed in, then keeps it', async () => {
    const empty = createTopic(db, {
      slug: 'cdn',
      title: 'CDN',
      position: 2,
      sourceSection: 'cache'
    })
    const calls: CliCallOptions[] = []
    const service = new GenerationService({
      db,
      resolveCli: async () => '/x/claude',
      runner: async (options) => {
        calls.push(options)
        return {
          isError: false,
          subtype: 'success',
          text: '',
          structuredOutput: cacheOutline as Json,
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0
        }
      }
    })
    const deps = { db, corpus, service }

    const outline = await ensureNotionOutline(deps, empty.id, { language: 'en' })
    expect(languageOf(calls[0]!)).toBe('en')
    updateSettings(db, { generationLanguage: 'fr' })
    expect(await ensureNotionOutline(deps, empty.id)).toEqual(outline)
    expect(calls).toHaveLength(1)
    service.dispose()
  })

  it('records the language of a quiz, and replaces a flagged question in the language of its quiz', async () => {
    const calls: CliCallOptions[] = []
    const deps = depsWith(calls)
    updateSettings(db, { generationLanguage: 'en' })
    const generated = await deps.service.generate(await prepareQuiz(deps, cache.id)).result
    const quiz = saveQuiz(db, cache.id, generated, 'en')
    expect(quiz.language).toBe('en')
    expect(languageOf(calls.at(-1)!)).toBe('en')

    // The setting changes while the round of this quiz is open: its questions stay English.
    updateSettings(db, { generationLanguage: 'fr' })
    const faulty = listQuestions(db, quiz.id)[0]!
    flagQuestion(db, faulty.id, null)
    // The fixture runner answers with a six-question quiz, so the replacement is refused as
    // invalid; the call it made is what this test is about.
    await regenerateQuestion(deps, faulty.id).catch(() => undefined)
    expect(languageOf(calls.at(-1)!)).toBe('en')
    deps.service.dispose()
  })
})
