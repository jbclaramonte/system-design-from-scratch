import { describe, expect, it } from 'vitest'
import type { Excerpt } from '../../corpus/lookup'
import {
  CACHE_SECTIONS,
  cacheNotions,
  cacheOutline,
  fixtureCorpus,
  SCENARIO_DIAGRAM,
  validQuiz
} from '../testing/contentFixtures'
import {
  assembleExcerpts,
  buildLessonGeneration,
  buildNotionOutlineGeneration,
  buildQuizGeneration,
  buildRemediationLessonGeneration,
  cleanExcerptMarkdown,
  diagramAnswerLeak,
  QUIZ_DIAGRAM_RULES,
  QUIZ_PROMPT_VERSION,
  LANGUAGE_RULES,
  findCitations,
  findNotionMarkers,
  notionMarker,
  quizRules,
  quizSchema,
  UNGROUNDED_RULES,
  unknownCitations,
  type GroundingInput,
  type QuizContent,
  type QuizOptions,
  type TopicBrief
} from './index'
import {
  buildFinalReviewGeneration,
  buildHintGeneration,
  buildStepFeedbackGeneration,
  type ExerciseBrief
} from './designFeedback'
import { buildFreeAnswerGradingGeneration } from './freeAnswerGrading'
import { buildProtocolStepLessonGeneration } from './protocolStepLesson'
import { checkDiagramSource } from '../../../shared/diagramSource'
import { findMermaidBlocks, repairDiagrams } from '../diagrams'
import { DIAGRAM_RULES, diagramPlacementRules } from './common'

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
    expect(build.prompt.system).toMatch(/Keep only system design jargon in English/)
    expect(build.prompt.system).toContain('Write everyday computing words in French')
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

  it('is steered by the Foundations Module scope when given', () => {
    const scoped = buildNotionOutlineGeneration(
      { ...http, scope: 'request and response', leftToPrimer: 'REST versus RPC' },
      ungrounded
    )
    expect(scoped.prompt.user).toContain('Scope of this topic: request and response')
    expect(scoped.prompt.user).toContain('Leave out (taught later in grounded topics')
    expect(scoped.prompt.user).toContain('REST versus RPC')
    expect(scoped.input).toMatchObject({ scope: 'request and response' })
    expect(buildNotionOutlineGeneration(http, ungrounded).prompt.user).not.toContain('Scope of')
  })

  it('keeps a grounded Foundations Module topic on its excerpts and scope', () => {
    const grounded = buildNotionOutlineGeneration(
      { ...http, scope: 'cache basics', leftToPrimer: 'eviction' },
      grounding
    )
    expect(grounded.groundedSourceSections).toEqual(CACHE_SECTIONS)
    expect(grounded.prompt.user).toContain('Foundations Module')
    expect(grounded.prompt.user).toContain('Scope of this topic: cache basics')
    expect(grounded.prompt.user).toContain('Every sub-topic listed above must appear')
    expect(grounded.prompt.user).not.toContain('is allowed too')
    expect(grounded.schema!.safeParse(cacheOutline).success).toBe(true)
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
    const noReminder = {
      questions: [
        single('1', ['cache-aside']),
        single('2', ['cache-aside']),
        single('3', ['cache-aside'])
      ]
    }
    expect(errorOf(ok, options)).toBeNull()
    expect(errorOf(tooManyReminders, options)).toMatch(/At most 1 question/)
    expect(errorOf(noReminder, options)).toMatch(/At least 1 reminder question/)
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
      'reminder question(s), tagged ONLY with already acquired notions: `client-caching`'
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

  it('keeps ungrounded answer keys conservative, and only ungrounded ones', () => {
    const ungroundedQuiz = buildQuizGeneration(http, cacheNotions, ungrounded).prompt.user
    const groundedQuiz = buildQuizGeneration(cache, cacheNotions, grounding).prompt.user
    expect(ungroundedQuiz).toContain(UNGROUNDED_RULES)
    expect(ungroundedQuiz).toContain('Never make a question depend on a precise measured number')
    expect(groundedQuiz).not.toContain('Answer keys without excerpts')
    expect(groundedQuiz).not.toContain(UNGROUNDED_RULES)
  })

  describe('question diagrams', () => {
    /** The quiz with the first scenario question's diagram set to `diagram`. */
    const withDiagram = (diagram: string) =>
      mutate((q) => {
        const scenario = q.questions[2]!
        if (scenario.type === 'scenario') scenario.diagram = diagram
      })

    it('accepts a valid diagram on scenario and choice questions, and no diagram', () => {
      expect(errorOf(validQuiz())).toBeNull()
      expect(
        errorOf(
          mutate((q) => {
            const first = q.questions[0]!
            if (first.type === 'single_choice') first.diagram = 'sequenceDiagram\n  C->>S: requête'
          })
        )
      ).toBeNull()
      expect(
        errorOf(
          mutate((q) => q.questions.forEach((x) => delete (x as { diagram?: string }).diagram))
        )
      ).toBeNull()
    })

    it('rejects forbidden content, unsupported types and oversized diagrams', () => {
      expect(errorOf(withDiagram(`${SCENARIO_DIAGRAM}\n  click S "https://x"`))).toMatch(
        /click interactions\. Fix the diagram/
      )
      expect(errorOf(withDiagram('flowchart LR\n  A[<b>Client</b>] --> B'))).toMatch(/HTML tags/)
      expect(
        errorOf(withDiagram('%%{init: {"theme": "dark"}}%%\nflowchart LR\n  A --> B'))
      ).toMatch(/configuration directive/)
      expect(errorOf(withDiagram('pie\n  "a" : 1'))).toMatch(/"pie" is not supported/)
      expect(errorOf(withDiagram(''))).not.toBeNull()
      const eleven = Array.from({ length: 10 }, (_, i) => `  N${i} --> N${i + 1}`).join('\n')
      expect(errorOf(withDiagram(`flowchart LR\n${eleven}`))).toMatch(/at most 10 nodes/)
    })

    it('rejects a diagram that gives the answer away', () => {
      const correct = validQuiz().questions[2]!
      if (correct.type !== 'scenario') throw new Error('fixture')
      const answer = correct.choices.find((c) => c.correct)!.text // "Choix 1"
      expect(errorOf(withDiagram(`flowchart LR\n  A[Client] --> B["${answer}"]`))).toMatch(
        /contains the correct choice "Choix 1"/
      )
      // Wrong choices may appear; case, accents and punctuation are ignored for the leak check.
      expect(errorOf(withDiagram('flowchart LR\n  A[Client] --> B["Choix 2"]'))).toBeNull()
      expect(errorOf(withDiagram('flowchart LR\n  A[Client] --> B[Bonne réponse]'))).toMatch(
        /"bonne reponse"/
      )
      expect(errorOf(withDiagram('flowchart LR\n  A[Client] -->|correct| B[Cache]'))).toMatch(
        /"correct"/
      )
      // Whole words only: "Choix 1" is not found in "Choix 12", "correct" not in "incorrectement".
      const choices = [{ text: 'Choix 1', correct: true }]
      expect(
        diagramAnswerLeak('flowchart LR\n  A[Choix 12] --> B[incorrectement]', choices)
      ).toBeNull()
      expect(diagramAnswerLeak('flowchart LR\n  A["CHOIX, 1"] --> B', choices)).not.toBeNull()
    })

    it('asks for diagrams on architecture and flow scenarios, without the answer', () => {
      const build = buildQuizGeneration(cache, cacheNotions, grounding)
      expect(QUIZ_PROMPT_VERSION).toBe('quiz-7')
      expect(build.prompt.version).toBe('quiz-7')
      expect(build.prompt.user).toContain(QUIZ_DIAGRAM_RULES)
      expect(QUIZ_DIAGRAM_RULES).toContain('involves components')
      expect(QUIZ_DIAGRAM_RULES).toContain('not its answer')
      expect(QUIZ_DIAGRAM_RULES).toContain('Answerable from the lesson')
      expect(QUIZ_DIAGRAM_RULES).toContain('at most 8 nodes')
      expect(QUIZ_DIAGRAM_RULES).toContain('never the flow of one of the choices')
      // A free-answer-only quiz gets no diagram rules.
      const free = buildQuizGeneration(cache, cacheNotions, grounding, {
        count: 1,
        types: ['free_answer']
      })
      expect(free.prompt.user).not.toContain('Diagrams (optional')
    })
  })

  it('states that every notion must be tagged when there is room, as the schema checks', () => {
    expect(buildQuizGeneration(cache, cacheNotions, grounding).prompt.user).toContain(
      'Tag every notion listed on at least one question (all 4, this is checked)'
    )
    expect(buildQuizGeneration(cache, cacheNotions, grounding, { count: 2 }).prompt.user).toContain(
      'at least 2 different notions'
    )
  })

  it('includes the lesson by hash in the cache input', () => {
    const build = buildQuizGeneration(cache, cacheNotions, grounding, { lessonMarkdown: '# Leçon' })
    expect(build.prompt.user).toContain('<lesson>\n# Leçon\n</lesson>')
    expect((build.input as { lesson: string }).lesson).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('language rule', () => {
  const exercise: ExerciseBrief = {
    title: 'Pastebin',
    problemStatement: 'Design a paste service.',
    referenceSolution: 'Reference.'
  }
  const text = { type: 'text' as const, text: 'Un serveur et une base de données.' }
  const builds = {
    notionOutline: buildNotionOutlineGeneration(cache, grounding),
    lesson: buildLessonGeneration(cache, cacheNotions, grounding),
    ungroundedLesson: buildLessonGeneration(http, cacheNotions, ungrounded),
    remediationLesson: buildRemediationLessonGeneration(cache, cacheNotions[0]!, grounding, {
      angle: 'analogy'
    }),
    quiz: buildQuizGeneration(cache, cacheNotions, grounding),
    ungroundedQuiz: buildQuizGeneration(http, cacheNotions, ungrounded),
    freeAnswerGrading: buildFreeAnswerGradingGeneration({
      question: { prompt: 'Pourquoi un TTL ?', expectedPoints: ['Expiration.'], modelAnswer: 'M.' },
      notions: [{ slug: 'cache-invalidation', title: 'Invalidation', description: null }],
      answer: 'Pour expirer.'
    }),
    protocolStepLesson: buildProtocolStepLessonGeneration('estimations', grounding),
    designStepFeedback: buildStepFeedbackGeneration({
      exercise,
      step: 'functional_requirements',
      submission: text,
      previousSteps: [],
      attempt: 1
    }),
    designHint: buildHintGeneration({
      exercise,
      step: 'functional_requirements',
      level: 1,
      current: text,
      previousSteps: [],
      previousHints: []
    }),
    designFinalReview: buildFinalReviewGeneration({
      exercise,
      steps: [{ step: 'functional_requirements', submission: text }]
    })
  }

  it.each(Object.entries(builds))('is in the %s prompt', (_, build) => {
    expect(`${build.prompt.system}\n${build.prompt.user}`).toContain(LANGUAGE_RULES)
  })

  it('keeps jargon in English and everyday words in French, with examples', () => {
    expect(LANGUAGE_RULES).toMatch(/load balancer, sharding, cache/)
    expect(LANGUAGE_RULES).toMatch(/serveur, client, requête, réponse, mémoire, disque, réseau/)
    expect(LANGUAGE_RULES).toContain('Bad: "le server renvoie une response"')
  })
})

describe('diagram rules', () => {
  const builds = {
    lesson: buildLessonGeneration(cache, cacheNotions, grounding),
    ungroundedLesson: buildLessonGeneration(http, cacheNotions, ungrounded),
    remediationLesson: buildRemediationLessonGeneration(cache, cacheNotions[0]!, grounding, {
      angle: 'concrete_example'
    }),
    protocolStepLesson: buildProtocolStepLessonGeneration('high_level_design', grounding)
  }

  it.each(Object.entries(builds))('are in the %s prompt, with the repair hook', (_, build) => {
    expect(build.prompt.system).toContain(DIAGRAM_RULES)
    expect(build.prompt.user).toMatch(/Diagram placement: include .* Mermaid diagram/)
    expect(build.finalize).toBe(repairDiagrams)
  })

  it('ask for 1 to 3 diagrams per lesson, at most 1 per remediation, at most 2 per step', () => {
    expect(builds.lesson.prompt.user).toContain('include 1 to 3 Mermaid diagrams')
    expect(builds.remediationLesson.prompt.user).toContain('include at most 1 Mermaid diagram')
    expect(builds.remediationLesson.prompt.user).toContain('from the angle above')
    expect(builds.protocolStepLesson.prompt.user).toContain('include at most 2 Mermaid diagrams')
    expect(builds.protocolStepLesson.prompt.user).toContain('typical high-level design')
    expect(diagramPlacementRules({ min: 2, max: 2, when: 'x' })).toContain('include 2 Mermaid')
  })

  it('name the supported types, the forbidden content and the grounding', () => {
    expect(DIAGRAM_RULES).toContain('```mermaid')
    expect(DIAGRAM_RULES).toMatch(/flowchart .*sequenceDiagram .*stateDiagram-v2 .*erDiagram/s)
    expect(DIAGRAM_RULES).toMatch(/no HTML tags, no <br>/)
    expect(DIAGRAM_RULES).toMatch(/no click/)
    expect(DIAGRAM_RULES).toMatch(/%%\{init\}%%/)
    expect(DIAGRAM_RULES).toMatch(/no style, classDef, class or linkStyle/)
    expect(DIAGRAM_RULES).toMatch(/at most about 12 nodes/)
    expect(DIAGRAM_RULES).toMatch(/same grounding rules as the text/)
  })

  it('give examples that pass the renderer checks', () => {
    const examples = findMermaidBlocks(DIAGRAM_RULES)
    expect(examples.map((block) => checkDiagramSource(block.source))).toEqual([
      { ok: true, type: 'flowchart' },
      { ok: true, type: 'sequenceDiagram' }
    ])
  })

  it('leave the other prompts alone', () => {
    const outline = buildNotionOutlineGeneration(cache, grounding)
    expect(outline.prompt.system).not.toContain(DIAGRAM_RULES)
    expect(outline.finalize).toBeUndefined()
  })
})
