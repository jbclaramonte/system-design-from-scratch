// One build of every prompt kind in a language, from fixed inputs: the guard tests read them to
// check the language of each prompt (`languageProfile.test.ts`) and to pin the French text
// (`frenchPrompts.test.ts`). The learner-facing sample texts are in the language of the build, so
// a prompt that still asks for the other language is the only thing left to find.
import { createHash } from 'node:crypto'
import type { DesignGraph } from '../../../shared/designGraph'
import type { GenerationLanguage } from '../../../shared/generationLanguage'
import { remediationAngles } from '../../../shared/mastery'
import { protocolSteps } from '../../../shared/protocol'
import { buildDiagramRepairCall } from '../diagrams'
import {
  buildFinalReviewGeneration,
  buildFreeAnswerGradingGeneration,
  buildHintGeneration,
  buildLessonGeneration,
  buildLessonQuestionGeneration,
  buildNotionOutlineGeneration,
  buildProtocolStepLessonGeneration,
  buildQuestionClarificationGeneration,
  buildQuizGeneration,
  buildRemediationLessonGeneration,
  buildStepFeedbackGeneration,
  type GroundingInput,
  type NotionBrief,
  type TopicBrief
} from '../prompts'
import { cacheNotions, fixtureCorpus } from './contentFixtures'

const corpus = fixtureCorpus()

const grounding: GroundingInput = {
  excerpts: corpus.findExcerpts({ sectionIds: ['cache'], limit: 50 }),
  corpusVersion: 'sha'
}
const ungrounded: GroundingInput = { excerpts: [], corpusVersion: 'ungrounded' }

const cache: TopicBrief = { slug: 'cache', title: 'Cache', inFoundationsModule: false }
const http: TopicBrief = {
  slug: 'http',
  title: 'HTTP',
  inFoundationsModule: true,
  scope: 'client server',
  leftToPrimer: 'DNS'
}

/** Sample texts a learner or an earlier Generation wrote, in the language of the build. */
const samples: Record<
  GenerationLanguage,
  {
    notions: NotionBrief[]
    /** The lesson a quiz is written from. */
    lesson: string
    /** The lesson a question is asked about. */
    shortLesson: string
    answer: string
    /** A quiz question. */
    quizQuestion: string
    /** A question the learner asks about a passage. */
    askedQuestion: string
    /** A question to reword. */
    clarifiedQuestion: string
    submission: string
    missed: string
    avoided: string
  }
> = {
  fr: {
    notions: cacheNotions,
    lesson: '# Leçon',
    shortLesson: '# L',
    answer: 'R.',
    quizQuestion: 'Pourquoi ?',
    askedQuestion: 'Q ?',
    clarifiedQuestion: 'P ?',
    submission: 'Un serveur.',
    missed: 'Q1 ?',
    avoided: 'Old ?'
  },
  en: {
    notions: cacheNotions.map((notion, index) => ({
      ...notion,
      title: ['Client-side caching', 'Cache-aside', 'Write-through', 'Cache consistency'][index]!,
      description: [
        'The browser or the OS keeps data in a cache to avoid requests.',
        'The application reads the cache, then the storage on a cache miss.',
        'The application writes to the cache, which acts as the main storage.',
        'A cache can drift from the database.'
      ][index]!
    })),
    lesson: '# Lesson',
    shortLesson: '# L',
    answer: 'A.',
    quizQuestion: 'Why?',
    askedQuestion: 'Q?',
    clarifiedQuestion: 'P?',
    submission: 'A server.',
    missed: 'Q1?',
    avoided: 'Old?'
  }
}

const graph: DesignGraph = {
  version: 1,
  nodes: [
    {
      id: 'a',
      componentType: 'client',
      label: 'Client',
      position: { x: 1, y: 2 },
      size: { w: 1, h: 1 }
    },
    { id: 'b', componentType: 'database', label: 'DB' }
  ],
  edges: [{ id: 'e', from: 'a', to: 'b', label: '', direction: 'forward' }],
  annotations: [],
  danglingArrows: [],
  groups: []
}

/** What one build gives the guard tests: the prompt text and its version. */
export interface BuiltPrompt {
  version: string
  system: string
  user: string
}

/** Every prompt kind of the app, with the variants that change its text. */
export function buildAllPrompts(language: GenerationLanguage): Record<string, BuiltPrompt> {
  const sample = samples[language]
  const out: Record<string, BuiltPrompt> = {}
  const add = (name: string, build: { prompt: BuiltPrompt }) => {
    const { version, system, user } = build.prompt
    out[name] = { version, system, user }
  }
  const exercise = {
    title: 'Pastebin',
    problemStatement: 'Design.',
    referenceSolution: 'REF text',
    activeSteps: ['functional_requirements', 'high_level_design'] as const
  }
  const text = { type: 'text' as const, text: sample.submission }
  const canvas = { type: 'canvas' as const, graph, description: 'desc', notes: 'notes' }
  const first = sample.notions[0]!

  add('lesson-grounded', buildLessonGeneration(cache, sample.notions, grounding, language))
  add('lesson-ungrounded', buildLessonGeneration(http, sample.notions, ungrounded, language))
  for (const angle of remediationAngles) {
    add(
      `remediation-${angle}`,
      buildRemediationLessonGeneration(cache, first, grounding, language, {
        angle,
        missedQuestionPrompts: [sample.missed],
        usedAngles: ['analogy']
      })
    )
  }
  add(
    'remediation-ungrounded',
    buildRemediationLessonGeneration(http, first, ungrounded, language, { angle: 'contrast' })
  )
  add('quiz-grounded', buildQuizGeneration(cache, sample.notions, grounding, language))
  add(
    'quiz-ungrounded',
    buildQuizGeneration(http, sample.notions, ungrounded, language, {
      lessonMarkdown: sample.lesson
    })
  )
  add(
    'quiz-targeted',
    buildQuizGeneration(cache, sample.notions, grounding, language, {
      focusNotions: ['cache-aside'],
      reminderNotions: ['write-through'],
      avoidPrompts: [sample.avoided],
      lessonMarkdown: sample.shortLesson
    })
  )
  add(
    'quiz-replaces',
    buildQuizGeneration(cache, sample.notions, grounding, language, {
      count: 1,
      types: ['free_answer'],
      replaces: { prompt: 'P', reason: 'bad' }
    })
  )
  add(
    'quiz-types',
    buildQuizGeneration(cache, sample.notions, grounding, language, {
      count: 3,
      types: ['single_choice', 'scenario']
    })
  )
  add('outline-grounded', buildNotionOutlineGeneration(cache, grounding, language))
  add('outline-ungrounded', buildNotionOutlineGeneration(http, ungrounded, language))
  add(
    'free-answer',
    buildFreeAnswerGradingGeneration({
      question: { prompt: sample.quizQuestion, expectedPoints: ['A.'], modelAnswer: 'M.' },
      notions: [{ slug: 's', title: 'T', description: 'D' }],
      answer: sample.answer,
      language
    })
  )
  add(
    'free-answer-contest',
    buildFreeAnswerGradingGeneration({
      question: { prompt: sample.quizQuestion, expectedPoints: ['A.'], modelAnswer: 'M.' },
      notions: [],
      answer: sample.answer,
      language,
      contest: {
        justification: 'J',
        previous: {
          verdict: 'incorrect',
          expectedPoints: [{ covered: false, justification: 'x' }],
          misconceptions: ['m'],
          explanation: 'e',
          toReview: ['r']
        }
      }
    })
  )
  for (const step of protocolSteps) {
    add(`protocol-step-${step}`, buildProtocolStepLessonGeneration(step, grounding, language))
  }
  add(
    'step-feedback-text',
    buildStepFeedbackGeneration({
      exercise,
      step: 'functional_requirements',
      submission: text,
      previousSteps: [],
      attempt: 1,
      language
    })
  )
  add(
    'step-feedback-canvas',
    buildStepFeedbackGeneration({
      exercise,
      step: 'high_level_design',
      submission: canvas,
      previousSteps: [{ step: 'functional_requirements', submission: text }],
      attempt: 2,
      png: 'AAAA',
      language
    })
  )
  add(
    'step-feedback-noref',
    buildStepFeedbackGeneration({
      exercise: { ...exercise, referenceSolution: null },
      step: 'estimations',
      submission: text,
      previousSteps: [],
      attempt: 1,
      language
    })
  )
  for (const level of [1, 2, 3] as const) {
    add(
      `hint-${level}`,
      buildHintGeneration({
        exercise,
        step: 'functional_requirements',
        level,
        current: text,
        previousSteps: [],
        previousHints: level > 1 ? ['h1'] : [],
        language
      })
    )
  }
  add(
    'final-review',
    buildFinalReviewGeneration({
      exercise,
      steps: [
        { step: 'functional_requirements', submission: text },
        { step: 'high_level_design', submission: canvas }
      ],
      language
    })
  )
  for (const textKind of ['lesson', 'remediation_lesson', 'protocol_step_lesson'] as const) {
    add(
      `lesson-question-${textKind}`,
      buildLessonQuestionGeneration(
        { textKind, title: 'T' },
        {
          lesson: `${sample.shortLesson}\n<!-- notion: x -->\nSel.`,
          selection: 'Sel.',
          question: sample.askedQuestion,
          thread: [{ selection: 'S0', question: 'Q0', answer: 'A0' }]
        },
        grounding,
        language
      )
    )
  }
  add(
    'lesson-question-ungrounded',
    buildLessonQuestionGeneration(
      { textKind: 'lesson', title: 'T' },
      { lesson: sample.shortLesson, selection: 'S', question: sample.askedQuestion, thread: [] },
      ungrounded,
      language
    )
  )
  for (const type of ['single_choice', 'multiple_choice', 'scenario', 'free_answer'] as const) {
    add(
      `clarification-${type}`,
      buildQuestionClarificationGeneration({
        questionId: 1,
        type,
        prompt: sample.clarifiedQuestion,
        scenario: type === 'scenario' ? 'S.' : null,
        choices: type === 'free_answer' ? [] : ['a', 'b'],
        topicTitle: 'Cache',
        language
      })
    )
  }
  add(
    'clarification-previous',
    buildQuestionClarificationGeneration(
      {
        questionId: 1,
        type: 'single_choice',
        prompt: sample.clarifiedQuestion,
        scenario: null,
        choices: ['a'],
        topicTitle: 'Cache',
        language
      },
      { rewording: 'r', example: 'e' }
    )
  )
  add('diagram-repair', {
    prompt: buildDiagramRepairCall(
      [
        {
          index: 1,
          source: 'flowchart LR\n A-->B',
          error: { code: 'x' as never, message: 'bad' },
          context: 'ctx'
        }
      ],
      language
    ).prompt
  })
  return out
}

/** SHA-256 of a prompt's text (system, then user): what `frenchPrompts.golden.json` pins. */
export const promptHash = ({ system, user }: BuiltPrompt) =>
  createHash('sha256').update(`${system}\u0000${user}`).digest('hex')
