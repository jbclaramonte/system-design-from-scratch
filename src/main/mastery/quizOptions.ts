// Quiz options of each round of the Mastery Loop. The first round's options are also the ones of
// the quiz Pre-generation started by the lesson flow: both sides must build them here, or the
// Content Cache key differs and the pre-generated quiz is never used.
import type { QuizOptions } from '../generation/prompts'
import type { AppSettings } from '../../shared/settings'

type QuizSettings = Pick<AppSettings, 'questionsPerQuiz'>

const countOption = ({ questionsPerQuiz }: QuizSettings): QuizOptions =>
  questionsPerQuiz === null ? {} : { count: questionsPerQuiz }

/** First round: every notion, answerable from the lesson the learner read. */
export function firstRoundQuizOptions(lessonMarkdown: string, settings: QuizSettings): QuizOptions {
  return { lessonMarkdown, ...countOption(settings) }
}

export interface NextRoundQuiz {
  lessonMarkdown: string
  /** Slugs of the notions missed in the failed round. */
  focusNotions: string[]
  /** Slugs of the other notions of the topic, for a few reminder questions. */
  reminderNotions: string[]
  /** Prompts of every question already played on the topic. */
  avoidPrompts: string[]
}

/** After a failed round: fresh questions on the missed notions plus a reminder of the others. */
export function nextRoundQuizOptions(next: NextRoundQuiz, settings: QuizSettings): QuizOptions {
  return {
    lessonMarkdown: next.lessonMarkdown,
    focusNotions: next.focusNotions,
    reminderNotions: next.reminderNotions,
    avoidPrompts: next.avoidPrompts,
    ...countOption(settings)
  }
}
