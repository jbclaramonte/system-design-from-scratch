import { describe, expect, it } from 'vitest'
import type { Excerpt } from '../../corpus/lookup'
import {
  CACHE_SECTIONS,
  cacheNotions,
  cacheOutline,
  fixtureCorpus,
  validQuiz
} from '../testing/contentFixtures'
import {
  assembleExcerpts,
  buildLessonGeneration,
  buildNotionOutlineGeneration,
  buildQuizGeneration,
  buildRemediationLessonGeneration,
  cleanExcerptMarkdown,
  findCitations,
  findNotionMarkers,
  notionMarker,
  quizRules,
  quizSchema,
  unknownCitations,
  type GroundingInput,
  type QuizContent,
  type QuizOptions,
  type TopicBrief
} from './index'

const corpus = fixtureCorpus()
const cache: TopicBrief = { slug: 'cache', title: 'Cache', inFoundationsModule: false }
const http: TopicBrief = { slug: 'http', title: 'HTTP', inFoundationsModule: true }
const grounding: GroundingInput = {
  excerpts: corpus.findExcerpts({ sectionIds: ['cache'], limit: 50 }),
  corpusVersion: 'sha'
}
const ungrounded: GroundingInput = { excerpts: [], corpusVersion: 'ungrounded' }

const excerpt = (sectionId: string, markdown: string): Excerpt => ({
  sectionId,
  title: sectionId,
  breadcrumb: [sectionId],
  markdown,
  score: 0,
  citation: { sectionId, breadcrumb: [sectionId], label: sectionId, url: 'u' }
})

describe('assembleExcerpts', () => {
  it('keeps excerpts in order within the token budget and reports their ids', () => {
    const excerpts = [excerpt('a', 'x'.repeat(400)), excerpt('b', 'y'.repeat(400))]

    const block = assembleExcerpts(excerpts, 150)

    expect(block.sectionIds).toEqual(['a'])
    expect(block.truncated).toBe(true)
    expect(block.text).toContain('<excerpt id="a"')
    expect(block.text).not.toContain('yyyy')
    expect(assembleExcerpts(excerpts, 1000).sectionIds).toEqual(['a', 'b'])
  })

  it('skips empty excerpts and strips HTML images and link targets', () => {
    const block = assembleExcerpts(
      [excerpt('empty', '<p align="center"><img src="x.png"></p>'), excerpt('b', 'text')],
      1000
    )
    expect(block.sectionIds).toEqual(['b'])
    expect(cleanExcerptMarkdown('See [the docs](https://x.y/z) <img src="a.png">')).toBe(
      'See the docs'
    )
  })
})

describe('citations and notion markers', () => {
  it('finds inline citations and the unknown ones', () => {
    const markdown = 'A [source: cache]. B [source: cache/client-caching] [source: Cache/Bogus].'
    expect(findCitations(markdown)).toEqual(['cache', 'cache/client-caching', 'Cache/Bogus'])
    expect(unknownCitations(markdown, CACHE_SECTIONS)).toEqual(['Cache/Bogus'])
  })

  it('finds notion markers', () => {
    expect(
      findNotionMarkers(`## A\n${notionMarker('cache-aside')}\n## B\n<!--notion:x-->`)
    ).toEqual(['cache-aside', 'x'])
  })
})

describe('lesson prompt', () => {
  it('is grounded on the topic excerpts, in French, with citation and structure rules', () => {
    const build = buildLessonGeneration(cache, cacheNotions, grounding)

    expect(build.kind).toBe('lesson')
    expect(build.schema).toBeUndefined()
    expect(build.groundedSourceSections).toEqual(CACHE_SECTIONS)
    expect(build.prompt.system).toMatch(/Write everything the learner reads in French/)
    expect(build.prompt.system).toMatch(/Keep system design technical terms in English/)
    expect(build.prompt.system).toMatch(/complete beginner/)
    expect(build.prompt.user).toContain('[source: <excerpt id>]')
    expect(build.prompt.user).toContain('Use only the facts stated in the excerpts')
    expect(build.prompt.user).toContain('<excerpt id="cache/when-to-update-the-cache"')
    expect(build.prompt.user).toContain('## Récapitulatif')
    expect(build.prompt.user).toContain('`cache-aside`: Cache-aside (lazy loading)')
    expect(build.input).toMatchObject({ topic: 'cache', corpusVersion: 'sha' })
  })

  it('has an ungrounded Foundations Module variant without excerpts or citations', () => {
    const build = buildLessonGeneration(http, cacheNotions, ungrounded)

    expect(build.groundedSourceSections).toEqual([])
    expect(build.prompt.user).toContain('Foundations Module')
    expect(build.prompt.user).toContain('do not write any [source: ...] citation')
    expect(build.prompt.user).not.toContain('<excerpt')
  })

  it('changes its cache input with the notions and the corpus version', () => {
    const a = buildLessonGeneration(cache, cacheNotions, grounding).input
    const b = buildLessonGeneration(cache, cacheNotions.slice(1), grounding).input
    const c = buildLessonGeneration(cache, cacheNotions, { ...grounding, corpusVersion: 'v2' })
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(c.input)
  })
})

describe('remediation lesson prompt', () => {
  it('targets one notion from the requested angle, with the missed questions', () => {
    const notion = cacheNotions[1]!
    const build = buildRemediationLessonGeneration(
      cache,
      notion,
      {
        excerpts: corpus.findExcerpts({ sectionIds: notion.sourceSections }),
        corpusVersion: 'sha'
      },
      { angle: 'analogy', missedQuestionPrompts: ['Que fait l’application sur un cache miss ?'] }
    )

    expect(build.kind).toBe('remediation_lesson')
    expect(build.groundedSourceSections).toEqual(['cache/when-to-update-the-cache'])
    expect(build.prompt.user).toContain('everyday analogy')
    expect(build.prompt.user).toContain('Que fait l’application sur un cache miss ?')
    expect(build.prompt.user).toContain('**À retenir**')
    expect(build.prompt.system).toMatch(/French/)
    expect(build.input).toMatchObject({ angle: 'analogy', notion: { slug: 'cache-aside' } })
  })
})

describe('notion outline', () => {
  const build = buildNotionOutlineGeneration(cache, grounding)

  it('is seeded by the sub-topics and accepts a covering outline', () => {
    expect(build.kind).toBe('notion_outline')
    expect(build.prompt.user).toContain('`cache/client-caching`: Client caching')
    expect(build.prompt.user).toContain('Every sub-topic listed above must appear')
    expect(build.schema!.safeParse(cacheOutline).success).toBe(true)
  })

  it('rejects duplicate slugs, uncovered sub-topics and unknown sections', () => {
    const [first, second, ...rest] = cacheOutline.notions
    const parse = (notions: unknown[]) => build.schema!.safeParse({ notions }).success
    expect(parse([first, { ...second, slug: first!.slug }, ...rest])).toBe(false)
    expect(parse([...rest, second])).toBe(false) // cache/client-caching not cited
    expect(parse([{ ...first, sourceSections: ['cache/bogus'] }, second, ...rest])).toBe(false)
    expect(parse([{ ...first, slug: 'Pas Un Slug' }, second, ...rest])).toBe(false)
  })

  it('is ungrounded in the Foundations Module', () => {
    const foundations = buildNotionOutlineGeneration(http, ungrounded)
    expect(foundations.groundedSourceSections).toEqual([])
    expect(foundations.prompt.user).toContain('Foundations Module')
    const notions = cacheOutline.notions.map((notion) => ({ ...notion, sourceSections: [] }))
    expect(foundations.schema!.safeParse({ notions }).success).toBe(true)
    expect(foundations.schema!.safeParse(cacheOutline).success).toBe(false)
  })
})

describe('quiz prompt and schema', () => {
  const schemaFor = (options: QuizOptions = {}, sections = CACHE_SECTIONS) =>
    quizSchema(quizRules(cacheNotions, sections, options))
  const mutate = (change: (quiz: QuizContent) => void) => {
    const quiz = validQuiz()
    change(quiz)
    return quiz
  }
  const errorOf = (quiz: QuizContent, options: QuizOptions = {}) => {
    const parsed = schemaFor(options).safeParse(quiz)
    return parsed.success ? null : parsed.error.issues.map((i) => i.message).join(' | ')
  }

  it('defaults to max(6, targeted notions) questions so every targeted notion is tested', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...cacheNotions[0]!,
      id: i + 1,
      slug: `notion-${i + 1}`
    }))

    expect(quizRules(many, CACHE_SECTIONS, {}).count).toBe(8)
    expect(quizRules(many, CACHE_SECTIONS, { focusNotions: ['notion-1', 'notion-2'] }).count).toBe(
      6
    )
    expect(quizRules(cacheNotions, CACHE_SECTIONS, {}).count).toBe(Math.max(6, cacheNotions.length))
    expect(quizRules(many, CACHE_SECTIONS, { count: 7 }).count).toBe(7)
  })

  it('asks for the four types, notion tags and answer keys, in French', () => {
    const build = buildQuizGeneration(cache, cacheNotions, grounding)

    expect(build.kind).toBe('quiz')
    expect(build.prompt.user).toContain('exactly 6 question(s)')
    for (const type of ['single_choice', 'multiple_choice', 'scenario', 'free_answer']) {
      expect(build.prompt.user).toContain(`\`${type}\``)
    }
    expect(build.prompt.user).toContain('Distractors: plausible')
    expect(build.prompt.user).toContain('`sourceSections`')
    expect(build.prompt.user).not.toContain('Cite the excerpt')
    expect(build.prompt.system).toMatch(/French/)
    expect(build.schema!.safeParse(validQuiz()).success).toBe(true)
  })

  it('accepts a valid quiz', () => {
    expect(errorOf(validQuiz())).toBeNull()
  })

  it('rejects inconsistent answer keys', () => {
    expect(
      errorOf(
        mutate((q) => {
          const first = q.questions[0]!
          if (first.type === 'single_choice') first.choices[0]!.correct = true
        })
      )
    ).toMatch(/exactly 1 correct choice, got 2/)
    expect(
      errorOf(
        mutate((q) => {
          const second = q.questions[1]!
          if (second.type === 'multiple_choice') second.choices[2]!.correct = false
        })
      )
    ).toMatch(/at least 2 correct choices/)
    expect(
      errorOf(
        mutate((q) => {
          const third = q.questions[2]!
          if (third.type === 'scenario') third.choices.forEach((c) => (c.correct = false))
        })
      )
    ).toMatch(/exactly 1 correct choice, got 0/)
  })

  it('rejects unknown notion tags and source sections, and missing fields', () => {
    expect(errorOf(mutate((q) => (q.questions[0]!.notions = ['bogus'])))).not.toBeNull()
    expect(
      errorOf(mutate((q) => (q.questions[0]!.sourceSections = ['cache/bogus'])))
    ).not.toBeNull()
    expect(errorOf(mutate((q) => (q.questions[0]!.notions = [])))).not.toBeNull()
    expect(
      errorOf(mutate((q) => delete (q.questions[3] as { modelAnswer?: string }).modelAnswer))
    ).not.toBeNull()
  })

  it('rejects duplicates, repeated prompts, a missing type and uncovered notions', () => {
    expect(errorOf(mutate((q) => (q.questions[4]!.prompt = q.questions[0]!.prompt)))).toMatch(
      /Duplicate question prompt/
    )
    expect(errorOf(validQuiz(), { avoidPrompts: ['où se trouve un  client cache ?'] })).toMatch(
      /already asked/
    )
    expect(
      errorOf(
        mutate((q) => {
          q.questions[3] = {
            ...q.questions[0]!,
            prompt: 'Autre question ?',
            notions: ['cache-consistency']
          }
        })
      )
    ).toMatch(/missing: free_answer/)
    expect(errorOf(mutate((q) => (q.questions[0]!.notions = ['cache-aside'])))).toMatch(
      /not covered: client-caching/
    )
    expect(errorOf({ questions: validQuiz().questions.slice(0, 5) })).not.toBeNull()
  })

  it('focuses a Mastery Loop round on missed notions with a capped number of reminders', () => {
    const options: QuizOptions = {
      count: 3,
      types: ['single_choice'],
      focusNotions: ['cache-aside'],
      reminderNotions: ['client-caching']
    }
    const single = (prompt: string, notions: string[]) => ({
      type: 'single_choice' as const,
      prompt,
      notions,
      sourceSections: ['cache'],
      choices: [
        { text: 'a', correct: true },
        { text: 'b', correct: false },
        { text: 'c', correct: false }
      ],
      explanation: 'e'
    })
    const ok = {
      questions: [
        single('1', ['cache-aside']),
        single('2', ['cache-aside']),
        single('3', ['client-caching'])
      ]
    }
    const tooManyReminders = {
      questions: [
        single('1', ['cache-aside']),
        single('2', ['client-caching']),
        single('3', ['client-caching'])
      ]
    }
    expect(errorOf(ok, options)).toBeNull()
    expect(errorOf(tooManyReminders, options)).toMatch(/At most 1 question/)
    // Notions outside focus and reminders cannot be tagged in that round.
    expect(
      errorOf({ questions: [...ok.questions.slice(0, 2), single('3', ['write-through'])] }, options)
    ).not.toBeNull()

    const build = buildQuizGeneration(cache, cacheNotions, grounding, {
      ...options,
      avoidPrompts: ['Ancienne question ?']
    })
    expect(build.prompt.user).toContain('mainly on the notions the learner missed: `cache-aside`')
    expect(build.prompt.user).toContain(
      'reminder question(s) on already acquired notions: `client-caching`'
    )
    expect(build.prompt.user).toContain('- Ancienne question ?')
    expect(() => quizRules(cacheNotions, CACHE_SECTIONS, { focusNotions: ['nope'] })).toThrow(
      /Unknown notion/
    )
  })

  it('has an ungrounded variant whose questions cite nothing', () => {
    const build = buildQuizGeneration(http, cacheNotions, ungrounded)
    expect(build.groundedSourceSections).toEqual([])
    expect(build.schema!.safeParse(validQuiz()).success).toBe(false)
    const quiz = mutate((q) => q.questions.forEach((question) => (question.sourceSections = [])))
    expect(build.schema!.safeParse(quiz).success).toBe(true)
  })

  it('includes the lesson by hash in the cache input', () => {
    const build = buildQuizGeneration(cache, cacheNotions, grounding, { lessonMarkdown: '# Leçon' })
    expect(build.prompt.user).toContain('<lesson>\n# Leçon\n</lesson>')
    expect((build.input as { lesson: string }).lesson).toMatch(/^[0-9a-f]{64}$/)
  })
})
