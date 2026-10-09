// Quiz prompt and output schema: a mix of the four question types, each question tagged with the
// notions it tests, with the answer key needed for local grading (or a rubric for free answers).
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { questionTypes, type Json, type QuestionType } from '../../db/types'
import {
  assembleExcerpts,
  AUDIENCE_RULES,
  excerptSection,
  groundingRules,
  joinParts,
  LANGUAGE_RULES,
  notionList,
  type GroundingInput,
  type NotionBrief,
  type PromptBuild,
  type TopicBrief
} from './common'
import { sourceSectionsSchema } from './notionOutline'

/** Bump with any change to the prompt or schema below. */
export const QUIZ_PROMPT_VERSION = 'quiz-1'

export const DEFAULT_QUESTION_COUNT = 6
export const QUIZ_EXCERPT_TOKENS = 8000

export interface QuizOptions {
  /** Number of questions. Default: max(6, number of targeted notions), so every targeted notion gets a question. */
  count?: number
  /** Mastery Loop rounds: fresh questions on these (missed) notions. Default: every notion. */
  focusNotions?: string[]
  /** Already acquired notions, for a few reminder questions next to the focus ones. */
  reminderNotions?: string[]
  /** Prompts of earlier questions that must not come back. */
  avoidPrompts?: string[]
  /** Allowed question types, default all four. */
  types?: QuestionType[]
  /** The lesson the learner read: every question must be answerable from it. */
  lessonMarkdown?: string
  /** The flagged question this quiz (of one question) replaces, with the learner's reason. */
  replaces?: { prompt: string; reason: string | null }
}

/** Resolved rules a quiz output is validated against. */
export interface QuizRules {
  count: number
  types: QuestionType[]
  /** Notions a question may be tagged with. */
  notionSlugs: string[]
  /** Notions the quiz must cover (the focus notions, or every notion). */
  targetNotions: string[]
  /** Questions tagged with no target notion allowed (reminders). */
  maxReminderQuestions: number
  /** Allowed `sourceSections`; empty when ungrounded. */
  sectionIds: string[]
  avoidPrompts: string[]
}

const choiceSchema = z.object({ text: z.string().min(1), correct: z.boolean() })

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

/** Schema of one question per type; `notions` and `sourceSections` limited to the given ids. */
function questionVariants(rules: QuizRules) {
  const base = {
    prompt: z.string().min(1),
    notions: z.array(z.enum(rules.notionSlugs as [string, ...string[]])).min(1),
    sourceSections: sourceSectionsSchema(rules.sectionIds)
  }
  const choices = z.array(choiceSchema).min(3).max(5)
  const explanation = z.string().min(1)
  return {
    single_choice: z.object({ type: z.literal('single_choice'), ...base, choices, explanation }),
    multiple_choice: z.object({
      type: z.literal('multiple_choice'),
      ...base,
      choices,
      explanation
    }),
    scenario: z.object({
      type: z.literal('scenario'),
      ...base,
      scenario: z.string().min(1),
      choices,
      explanation
    }),
    free_answer: z.object({
      type: z.literal('free_answer'),
      ...base,
      expectedPoints: z.array(z.string().min(1)).min(1).max(4),
      modelAnswer: z.string().min(1)
    })
  }
}

type Variants = ReturnType<typeof questionVariants>
export type QuizQuestion = z.infer<Variants[QuestionType]>
export type QuizContent = {
  questions: QuizQuestion[]
}

/**
 * Quiz output schema. Beyond the shape, it rejects inconsistent answer keys (single choice and
 * scenario: exactly one correct choice; multiple choice: at least two correct and one wrong),
 * duplicate choices or prompts, prompts to avoid, unknown notion tags, and a quiz that misses
 * a type or a target notion it had room for.
 */
export function quizSchema(rules: QuizRules): z.ZodType<QuizContent> {
  const variants = questionVariants(rules)
  const allowed = rules.types.map((type) => variants[type])
  const question = z.discriminatedUnion('type', allowed as [Variants[QuestionType]])
  const avoid = new Set(rules.avoidPrompts.map(normalize))
  const targets = new Set(rules.targetNotions)

  return z
    .object({ questions: z.array(question).length(rules.count) })
    .superRefine(({ questions }, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path: ['questions', ...path], message })
      const prompts = new Set<string>()
      let reminders = 0

      questions.forEach((q, index) => {
        const prompt = normalize(q.prompt)
        if (prompts.has(prompt)) issue([index, 'prompt'], 'Duplicate question prompt.')
        if (avoid.has(prompt))
          issue([index, 'prompt'], 'This prompt was already asked: write a new question.')
        prompts.add(prompt)
        if (new Set(q.notions).size !== q.notions.length) {
          issue([index, 'notions'], 'Duplicate notion tag.')
        }
        if (!q.notions.some((slug) => targets.has(slug))) reminders++

        if (q.type === 'free_answer') return
        const correct = q.choices.filter((choice) => choice.correct).length
        if (q.type === 'multiple_choice') {
          if (correct < 2 || correct === q.choices.length) {
            issue(
              [index, 'choices'],
              'A multiple_choice question needs at least 2 correct choices and at least 1 wrong one.'
            )
          }
        } else if (correct !== 1) {
          issue(
            [index, 'choices'],
            `A ${q.type} question needs exactly 1 correct choice, got ${correct}.`
          )
        }
        if (new Set(q.choices.map((c) => normalize(c.text))).size !== q.choices.length) {
          issue([index, 'choices'], 'Duplicate choice text.')
        }
      })

      if (reminders > rules.maxReminderQuestions) {
        issue(
          [],
          `At most ${rules.maxReminderQuestions} question(s) may test only reminder notions, got ${reminders}.`
        )
      }
      if (rules.count >= rules.types.length) {
        const used = new Set(questions.map((q) => q.type))
        const missing = rules.types.filter((type) => !used.has(type))
        if (missing.length)
          issue([], `Use every question type at least once; missing: ${missing.join(', ')}.`)
      }
      const covered = new Set(
        questions.flatMap((q) => q.notions).filter((slug) => targets.has(slug))
      )
      const needed = Math.min(targets.size, rules.count)
      if (covered.size < needed) {
        const missing = rules.targetNotions.filter((slug) => !covered.has(slug))
        issue(
          [],
          `Cover at least ${needed} of the target notions; not covered: ${missing.join(', ')}.`
        )
      }
    }) as z.ZodType<QuizContent>
}

/** Resolves the options against the topic's notions. Throws on unknown notion slugs. */
export function quizRules(
  notions: readonly NotionBrief[],
  sectionIds: string[],
  options: QuizOptions
): QuizRules {
  const known = new Set(notions.map((notion) => notion.slug))
  const focus = options.focusNotions ?? []
  const reminder = (options.reminderNotions ?? []).filter((slug) => !focus.includes(slug))
  for (const slug of [...focus, ...reminder]) {
    if (!known.has(slug)) throw new Error(`Unknown notion "${slug}".`)
  }
  if (known.size === 0) throw new Error('A quiz needs at least one notion.')
  const targeted = focus.length > 0
  const targetCount = targeted ? focus.length : known.size
  const count = options.count ?? Math.max(DEFAULT_QUESTION_COUNT, targetCount)
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error(`Invalid question count ${count}.`)
  }
  const types = options.types?.length ? [...new Set(options.types)] : [...questionTypes]
  return {
    count,
    types,
    notionSlugs: targeted ? [...focus, ...reminder] : [...known],
    targetNotions: targeted ? focus : [...known],
    maxReminderQuestions: targeted && reminder.length ? Math.max(1, Math.floor(count / 3)) : 0,
    sectionIds,
    avoidPrompts: options.avoidPrompts ?? []
  }
}

const typeRules: Record<QuestionType, string> = {
  single_choice: '`single_choice`: 3 or 4 choices, exactly 1 correct.',
  multiple_choice:
    '`multiple_choice` ("select all that apply"): 4 or 5 choices, at least 2 correct and at least 1 wrong. Do not say how many are correct.',
  scenario:
    '`scenario` (trade-off): `scenario` describes a short realistic situation in 2 to 4 sentences with explicit constraints (traffic, consistency needs, cost...); `prompt` asks which option fits best; 3 or 4 choices that are real alternatives with different trade-offs; exactly 1 correct, made unambiguous by the stated constraints.',
  free_answer:
    '`free_answer`: a question answered in 1 to 3 sentences (explain why, compare, predict what happens). `expectedPoints`: 1 to 3 short points a correct answer must contain, used later by a grader. `modelAnswer`: a model answer in 1 to 3 sentences. No `choices`.'
}

const SYSTEM = `You write quizzes for a French system design learning app. Your questions are graded automatically from the answer key you provide, so the key must be unambiguous and correct.

${LANGUAGE_RULES}

${AUDIENCE_RULES}`

export function buildQuizGeneration(
  topic: TopicBrief,
  notions: readonly NotionBrief[],
  grounding: GroundingInput,
  options: QuizOptions = {}
): PromptBuild<QuizContent> {
  const block = assembleExcerpts(grounding.excerpts, QUIZ_EXCERPT_TOKENS)
  const rules = quizRules(notions, block.sectionIds, options)
  const bySlug = new Map(notions.map((notion) => [notion.slug, notion]))
  const listed = rules.notionSlugs.map((slug) => bySlug.get(slug)!)
  const reminder = rules.notionSlugs.filter((slug) => !rules.targetNotions.includes(slug))
  const targeted = options.focusNotions?.length

  const user = joinParts(
    `Write a quiz of exactly ${rules.count} question(s) on the topic "${topic.title}" (id \`${topic.slug}\`).`,
    `Notions (tag questions with these slugs only):\n${notionList(listed)}`,
    targeted
      ? `This is a new round after a failed quiz. Write fresh questions mainly on the notions the learner missed: ${rules.targetNotions.map((s) => `\`${s}\``).join(', ')}. ${reminder.length ? `Add at most ${rules.maxReminderQuestions} reminder question(s) on already acquired notions: ${reminder.map((s) => `\`${s}\``).join(', ')}.` : ''}`
      : `Cover as many notions as possible (every notion if there is room).`,
    options.replaces &&
      `This question replaces one the learner flagged as faulty. Flagged question: "${options.replaces.prompt}". ${options.replaces.reason ? `Learner's reason: "${options.replaces.reason}". ` : ''}Test the same notions with a different, correct and unambiguous question that avoids that flaw.`,
    `Question types allowed: ${rules.types.map((t) => `\`${t}\``).join(', ')}.${rules.count >= rules.types.length ? ' Use each allowed type at least once, then favor `single_choice` and `scenario`.' : ''}
${rules.types.map((type) => `- ${typeRules[type]}`).join('\n')}`,
    `Rules for every question:
- \`prompt\`: the question itself, in French, self-contained, one idea at a time. Order the quiz from easiest to hardest.
- \`notions\`: the slugs of the 1 or 2 notions the question really tests.
- \`sourceSections\`: ${rules.sectionIds.length ? 'the excerpt ids that support the answer key.' : 'always an empty array (ungrounded).'}
- Test understanding (why, when, what happens if...), not memorization of wording or numbers. Every question must be answerable by a beginner who read ${options.lessonMarkdown ? 'the lesson below' : 'a lesson covering these notions'}, using only the facts of the ${rules.sectionIds.length ? 'excerpts' : 'lesson'}.
- Distractors: plausible for a beginner (common misconceptions, real terms of the topic used in the wrong place), similar in length and style to the correct choice. No "toutes les réponses" or "aucune de ces réponses", no trick wording, no double negation. Vary the position of correct choices.
- \`explanation\` (choice questions): 1 to 3 French sentences on why the correct choice(s) are right and why the most tempting wrong one is wrong. It is shown after the answer.`,
    rules.avoidPrompts.length > 0 &&
      `Do not repeat or paraphrase these earlier questions:\n${rules.avoidPrompts.map((p) => `- ${p}`).join('\n')}`,
    groundingRules(block.sectionIds).replace(
      /Cite the excerpt[^\n]*/,
      'Give the supporting excerpt ids in `sourceSections`; do not write [source: ...] in the questions.'
    ),
    options.lessonMarkdown &&
      `The lesson the learner read:\n<lesson>\n${options.lessonMarkdown}\n</lesson>`,
    excerptSection(block)
  )

  return {
    kind: 'quiz',
    input: {
      topic: topic.slug,
      notions: rules.notionSlugs,
      targetNotions: rules.targetNotions,
      count: rules.count,
      types: rules.types,
      avoidPrompts: rules.avoidPrompts,
      lesson: options.lessonMarkdown ? sha256(options.lessonMarkdown) : null,
      replaces: options.replaces ?? null,
      sectionIds: block.sectionIds,
      corpusVersion: grounding.corpusVersion
    },
    prompt: { version: QUIZ_PROMPT_VERSION, system: SYSTEM, user },
    schema: quizSchema(rules),
    groundedSourceSections: block.sectionIds
  }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** The `questions.body` payload of a generated question: everything but type, prompt and tags. */
export function questionBody(question: QuizQuestion): Json {
  const body: Record<string, Json> = {}
  for (const [key, value] of Object.entries(question)) {
    if (key !== 'type' && key !== 'prompt' && key !== 'notions') body[key] = value as Json
  }
  return body
}
