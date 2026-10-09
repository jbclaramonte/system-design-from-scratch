// Mastery Loop service: drives a topic from its lesson to mastery. The state comes from the
// database (see state.ts); this service prepares the Generations of each step (next quiz,
// Remediation Lessons), reuses the Content Cache and records what the learner saw.
import {
  listAttemptsByRound,
  listQuestionHistory,
  listQuizzesByTopic,
  listRoundsByTopic,
  getQuestion,
  getRound
} from '../db/repositories/assessment'
import {
  createRemediationLesson,
  getNotion,
  getTopic,
  listLessonsByTopic,
  listNotionsByTopic,
  listRemediationLessonsByNotion
} from '../db/repositories/learningContent'
import { setRoundLimitChoice } from '../db/repositories/mastery'
import { getSettings } from '../db/repositories/settings'
import type { Notion, Round } from '../db/types'
import { GenerationError } from '../generation/errors'
import {
  prepareQuiz,
  prepareRemediationLesson,
  saveQuiz,
  type PipelineDeps,
  type RunOptions
} from '../generation/pipelines'
import type { QuizContent } from '../generation/prompts'
import type { GenerationRequest } from '../generation/service'
import type { QuizService } from '../quiz/service'
import type { GenerationEvent, GenerationOutput } from '../../shared/generation'
import type {
  MasteryState,
  RemediationTarget,
  RoundLimitChoice,
  TopicMasterySummary
} from '../../shared/mastery'
import type { RoundStart, RoundView } from '../../shared/quiz'
import { listTopicMasteries, loadMasterySnapshot } from './queries'
import { firstRoundQuizOptions, nextRoundQuizOptions } from './quizOptions'
import { cannotChoose, cannotStartRound, deriveMastery, type DerivedMastery } from './state'

export interface MasteryServiceDeps extends PipelineDeps {
  quiz: QuizService
  /** Called when a Pre-generation fails (defaults to `console.error`). */
  onPregenerationError?: (error: unknown) => void
}

export interface RemediationRun {
  request: GenerationRequest<string>
  /** The failed round the Remediation Lesson follows. */
  roundId: number
  notion: Notion
}

export interface StartRoundOptions {
  signal?: AbortSignal
  /** Events of the quiz Generation, `done` excluded (it holds the answer keys). */
  onEvent?: (event: GenerationEvent) => void
}

export interface MasteryService {
  getState(topicId: number): MasteryState
  listTopics(): TopicMasterySummary[]
  /** The quiz Generation of the next round (in the `lesson` and `remediation` steps). */
  nextQuizRequest(topicId: number, run?: RunOptions): Promise<GenerationRequest<QuizContent>>
  /**
   * Resumes the open round, or prepares the next round's quiz (from the Content Cache when it was
   * pre-generated), stores it and starts the round.
   */
  startRound(topicId: number, options?: StartRoundOptions): Promise<RoundStart>
  /** The Remediation Lesson Generation of a missed notion of the current remediation step. */
  prepareRemediation(topicId: number, notionId: number, run?: RunOptions): RemediationRun
  /** Records the Remediation Lesson the learner saw, once per round and notion. */
  recordRemediation(run: RemediationRun, output: GenerationOutput): void
  /** Pre-generates the rest of the remediation step: other Remediation Lessons, next quiz. */
  pregenerateRemediationStep(topicId: number, exceptNotionId?: number): void
  /** The learner's choice at the Round Limit (or coming back to a skipped topic). */
  choose(topicId: number, choice: RoundLimitChoice): MasteryState
}

const toRoundView = (round: Round): RoundView => ({
  id: round.id,
  topicId: round.topicId,
  quizId: round.quizId,
  number: round.number,
  startedAt: round.startedAt,
  completedAt: round.completedAt,
  scorePercent: round.scorePercent,
  passed: round.passed
})

export function createMasteryService(deps: MasteryServiceDeps): MasteryService {
  const { db, quiz } = deps
  const onPregenerationError =
    deps.onPregenerationError ??
    ((error: unknown) => console.error('Mastery Loop pre-generation failed', error))

  function requireTopic(topicId: number) {
    const topic = getTopic(db, topicId)
    if (!topic) throw new Error(`Topic ${topicId} does not exist.`)
    return topic
  }

  function derive(topicId: number): DerivedMastery {
    requireTopic(topicId)
    return deriveMastery(loadMasterySnapshot(db, topicId))
  }

  function latestLesson(topicId: number): string {
    const lesson = listLessonsByTopic(db, topicId)[0]
    if (!lesson) throw new Error('Read the lesson before the first quiz.')
    return lesson.content
  }

  /** Quizzes played in a round of the topic, in round order. */
  function playedQuizIds(topicId: number): number[] {
    return [...new Set(listRoundsByTopic(db, topicId).map((round) => round.quizId))]
  }

  /** Every question prompt already played on the topic (replaced questions included). */
  function playedPrompts(topicId: number): string[] {
    const prompts = playedQuizIds(topicId).flatMap((quizId) =>
      listQuestionHistory(db, quizId).map((question) => question.prompt)
    )
    return [...new Set(prompts)]
  }

  function requireRemediationTarget(
    topicId: number,
    notionId: number
  ): { roundId: number; target: RemediationTarget } {
    const { step } = derive(topicId)
    if (step.name !== 'remediation') throw new Error('There is no remediation step now.')
    const target = step.targets.find((t) => t.notion.id === notionId)
    if (!target) throw new Error(`Notion ${notionId} was not missed in the last round.`)
    return { roundId: step.roundId, target }
  }

  /** Prompts of the questions of the round tagged with the notion that were not fully correct. */
  function missedPrompts(roundId: number, notionId: number): string[] {
    return listAttemptsByRound(db, roundId)
      .filter((attempt) => attempt.score < 1 && attempt.notionIds.includes(notionId))
      .flatMap((attempt) => getQuestion(db, attempt.questionId)?.prompt ?? [])
  }

  const ignoreCancelled = (error: unknown) => {
    if (!(error instanceof GenerationError && error.code === 'cancelled')) {
      onPregenerationError(error)
    }
  }

  const service: MasteryService = {
    getState(topicId) {
      const topic = requireTopic(topicId)
      const derived = derive(topicId)
      const { masteryThreshold, roundLimit } = getSettings(db)
      const lastRound = derived.lastRoundId === null ? undefined : getRound(db, derived.lastRoundId)
      return {
        topicId,
        topicTitle: topic.title,
        status: derived.status,
        step: derived.step,
        roundNumber: derived.roundNumber,
        failedRounds: derived.failedRounds,
        masteryThreshold,
        roundLimit,
        lastRound: lastRound ? toRoundView(lastRound) : null
      }
    },

    listTopics: () => listTopicMasteries(db),

    async nextQuizRequest(topicId, run = {}) {
      const { step } = derive(topicId)
      const settings = getSettings(db)
      if (step.name === 'lesson') {
        return prepareQuiz(
          deps,
          topicId,
          firstRoundQuizOptions(latestLesson(topicId), settings),
          run
        )
      }
      if (step.name !== 'remediation') {
        throw new Error(cannotStartRound(step) ?? 'A round is already open.')
      }
      const focus = new Set(step.targets.map((target) => target.notion.slug))
      const notions = listNotionsByTopic(db, topicId).map((notion) => notion.slug)
      const options = nextRoundQuizOptions(
        {
          lessonMarkdown: latestLesson(topicId),
          focusNotions: notions.filter((slug) => focus.has(slug)),
          reminderNotions: notions.filter((slug) => !focus.has(slug)),
          avoidPrompts: playedPrompts(topicId)
        },
        settings
      )
      return prepareQuiz(deps, topicId, options, run)
    },

    async startRound(topicId, { signal, onEvent } = {}) {
      const { step } = derive(topicId)
      if (step.name === 'round') return quiz.startRound(step.quizId)
      const refused = cannotStartRound(step)
      if (refused) throw new Error(refused)

      const run = deps.service.generate(await service.nextQuizRequest(topicId, { signal }))
      for await (const event of run.events) if (event.type !== 'done') onEvent?.(event)
      const result = await run.result

      const quizId = db.transaction(() => {
        // The same quiz may already be stored (the app quit between storing and starting).
        const played = new Set(playedQuizIds(topicId))
        const stored = listQuizzesByTopic(db, topicId).find(
          (q) => q.contentCacheKey === result.cacheKey && !played.has(q.id)
        )
        return (stored ?? saveQuiz(db, topicId, result)).id
      })
      return quiz.startRound(quizId)
    },

    prepareRemediation(topicId, notionId, run = {}) {
      const { roundId, target } = requireRemediationTarget(topicId, notionId)
      const request = prepareRemediationLesson(
        deps,
        notionId,
        {
          angle: target.angle,
          missedQuestionPrompts: missedPrompts(roundId, notionId),
          usedAngles: target.usedAngles
        },
        run
      )
      return { request, roundId, notion: getNotion(db, notionId)! }
    },

    recordRemediation({ roundId, notion }, output) {
      if (typeof output.content !== 'string') return
      const content = output.content
      db.transaction(() => {
        const known = listRemediationLessonsByNotion(db, notion.id).some(
          (lesson) => lesson.roundId === roundId
        )
        if (known) return
        createRemediationLesson(db, {
          notionId: notion.id,
          roundId,
          content,
          grounded: output.grounded,
          sourceSections: output.sourceSections,
          contentCacheKey: output.cacheKey
        })
      })
    },

    pregenerateRemediationStep(topicId, exceptNotionId) {
      const { step } = derive(topicId)
      if (step.name !== 'remediation') return
      for (const target of step.targets) {
        if (target.ready || target.notion.id === exceptNotionId) continue
        const { request } = service.prepareRemediation(topicId, target.notion.id)
        deps.service.pregenerate(request).result.catch(ignoreCancelled)
      }
      service
        .nextQuizRequest(topicId)
        .then((request) => deps.service.pregenerate(request).result)
        .catch(ignoreCancelled)
    },

    choose(topicId, choice) {
      const { step } = derive(topicId)
      const refused = cannotChoose(step, choice)
      if (refused) throw new Error(refused)
      if (step.name === 'limit_reached' || step.name === 'skipped') {
        setRoundLimitChoice(db, step.roundId, choice)
      }
      return service.getState(topicId)
    }
  }
  return service
}
