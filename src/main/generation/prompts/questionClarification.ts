// Question Clarification prompt and output schema: a plainer French rewording of a quiz question
// the learner does not understand, with one concrete example. It clarifies the wording only.
//
// The answer keys cannot leak by construction: `QuestionBrief` has no field for the correct
// choices, the explanation or the rubric of a free answer. The caller (the quiz service) copies
// only the prompt, the scenario and the choice texts into it, and the builder reads nothing else.
import { z } from 'zod'
import type { QuestionClarification, QuestionType } from '../../../shared/quiz'
import { AUDIENCE_RULES, joinParts, LANGUAGE_RULES, type PromptBuild } from './common'

/** Bump with any change to the prompt or schema below. */
export const QUESTION_CLARIFICATION_PROMPT_VERSION = 'question-clarification-1'

/** A reformulation is quick: past this, the learner gets a `timeout` error and can retry. */
export const QUESTION_CLARIFICATION_TIMEOUT_MS = 60_000

/**
 * What the prompt gets to know about a question: what the learner sees, nothing more. No
 * `correct` flag, no explanation, no expected points or model answer, no notion tags (a tag can
 * name the concept the question is about, which is the answer to "which strategy...").
 */
export interface QuestionBrief {
  questionId: number
  type: QuestionType
  /** French. */
  prompt: string
  /** Situation of a scenario question, French. */
  scenario: string | null
  /** Choice texts, in display order. Empty for a free answer. */
  choices: readonly string[]
  /** Topic title, for orientation only. */
  topicTitle: string
}

export const questionClarificationSchema = z.object({
  rewording: z.string().min(1).max(700),
  example: z.string().min(1).max(600)
}) satisfies z.ZodType<QuestionClarification>

const typeDescriptions: Record<QuestionType, string> = {
  single_choice: 'single choice (one choice is right)',
  multiple_choice: 'multiple choice (the learner selects every right choice)',
  scenario: 'scenario (the learner picks the best trade-off for a situation)',
  free_answer: 'free answer (the learner writes one to a few sentences; no choices)'
}

const SYSTEM = `You help a beginner in system design who did not understand a quiz question. You reword the question in plainer words and give one concrete example, so the learner can then answer it themselves.

${LANGUAGE_RULES}

${AUDIENCE_RULES}

What you write:
- "rewording": the same question in simpler words: short sentences, no unnecessary jargon, the vocabulary of the question explained in a few words where needed. It asks exactly what the original asks, at the same level: do not make the question easier, narrower or different, and keep what the learner is asked to do (pick one, select all that apply, or write a short answer). 2 to 4 sentences.
- "example": ONE concrete, everyday example (a shop, a library, a bus line, a restaurant kitchen, a post office...) that shows the situation or the vocabulary of the question statement. 2 to 4 sentences.

Hard rules, the learner must still do the thinking:
- Never reveal the correct answer or the correct choice, never hint at it (no "think about...", no emphasis, no wording that favours a choice), never say or imply that a choice is wrong, never eliminate or rank choices, and never compare them.
- Never teach the answer: do not explain the concept that answers the question, do not state the rule, trade-off or mechanism the question tests. You may explain the words of the question statement itself, not the content of the choices.
- The choices (when there are some) are only there so that you do not contradict the question. Do not mention, quote, paraphrase or comment on any of them. Write no list of choices.
- The example illustrates the situation of the question, never its solution: if an example would give the answer away, make it about the situation only. It makes no technical claim (no numbers, product names or guarantees about systems).
- If the question is already plain, still reword it differently and say nothing about the answer.

Output only the JSON object.`

/** The question as the learner sees it, delimited. */
function questionBlock(brief: QuestionBrief): string {
  const choices =
    brief.choices.length > 0
      ? `Choices the learner picks from (to avoid contradicting the question, never to mention):\n${brief.choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n')}`
      : false
  return joinParts(
    `Topic: ${brief.topicTitle}`,
    `Question type: ${typeDescriptions[brief.type]}.`,
    !!brief.scenario && `<scenario>\n${brief.scenario}\n</scenario>`,
    `<question>\n${brief.prompt}\n</question>`,
    choices
  )
}

/**
 * `previous` is the clarification the learner already read ("Reformulate differently"): the new
 * one must differ clearly. It is model output about the wording only, never an answer.
 */
export function buildQuestionClarificationGeneration(
  brief: QuestionBrief,
  previous?: QuestionClarification
): PromptBuild<QuestionClarification> {
  const user = joinParts(
    'Reword this quiz question for a learner who did not understand it.',
    questionBlock(brief),
    previous &&
      `The learner already read this clarification and it did not help. Write a clearly different rewording (other words, other sentence structure) and a different example (other setting):\n<previous_clarification>\nRewording: ${previous.rewording}\nExample: ${previous.example}\n</previous_clarification>`
  )
  return {
    kind: 'question_clarification',
    // Content Cache key with the prompt version: one entry per Question. `previous` is not part
    // of it, so a new version replaces the stored one.
    input: { questionId: brief.questionId },
    prompt: { version: QUESTION_CLARIFICATION_PROMPT_VERSION, system: SYSTEM, user },
    schema: questionClarificationSchema,
    // Rewording only: not tied to the lesson or the Excerpts.
    groundedSourceSections: []
  }
}
