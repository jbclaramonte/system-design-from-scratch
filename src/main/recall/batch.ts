// Recall batches: new questions for later Recall Quizzes, generated in the background once a
// Lesson has finished streaming. At most one batch on the shakiest eligible Topic and one on a
// declared Topic without a Notion Outline per opened Lesson; both are Pre-generations, stored as
// `recall` quizzes, and a failure is only logged (see "Recall Quiz" in the design spec).
import type { GenerationLanguage } from '../../shared/generationLanguage'
import type { Database } from '../db'
import { listNotionsByTopic } from '../db/repositories/learningContent'
import type { QuestionType } from '../db/types'
import { GenerationError } from '../generation/errors'
import { prepareQuiz, saveQuiz, type PipelineDeps } from '../generation/pipelines'
import type { QuizContent } from '../generation/prompts'
import type { GenerationResult } from '../generation/service'
import { eligibleTopicIds, type PassedTopic } from './eligibility'
import { classifyNotion } from './memory'
import { loadNotionResults, loadPassedTopics } from './queries'

/** Questions per batch. */
const RECALL_BATCH_SIZE = 3

/** Graded locally: a Recall session never needs a Generation to grade an answer. */
const RECALL_BATCH_TYPES: QuestionType[] = ['single_choice', 'multiple_choice', 'scenario']

const MAX_FOCUS_NOTIONS = 3

export interface RecallBatchPlan {
  kind: 'shaky' | 'declared'
  topicId: number
  /** The Notions the questions target; empty for a declared Topic (every Notion). */
  focusNotionIds: number[]
  /** Prompts the new questions must not repeat. */
  avoidPrompts: string[]
}

/** Eligible Topics, the one passed earliest first (it has waited longest). */
function eligibleTopics(db: Database, openingTopicId: number): PassedTopic[] {
  const passed = loadPassedTopics(db)
  const eligible = new Set(eligibleTopicIds(passed, openingTopicId))
  return passed
    .filter((topic) => eligible.has(topic.topicId))
    .sort((a, b) => Date.parse(a.passedAt) - Date.parse(b.passedAt) || a.topicId - b.topicId)
}

/**
 * Every prompt asked (answered at least once) on the given Notions, of any quiz, in the given
 * language: questions in another language are never reused next to the new ones, and would mix
 * languages in the prompt. Oldest question first.
 */
function askedPrompts(
  db: Database,
  notionIds: readonly number[],
  language: GenerationLanguage
): string[] {
  const params: Record<string, number | string> = { language }
  const placeholders = notionIds.map((notionId, index) => {
    params[`notion${index}`] = notionId
    return `$notion${index}`
  })
  return db
    .prepare(
      `SELECT q.prompt FROM questions q
       JOIN quizzes z ON z.id = q.quiz_id
       WHERE z.language = $language
         AND EXISTS (SELECT 1 FROM question_notions qn
                     WHERE qn.question_id = q.id AND qn.notion_id IN (${placeholders.join(', ')}))
         AND EXISTS (SELECT 1 FROM attempts a WHERE a.question_id = q.id)
       GROUP BY q.prompt
       ORDER BY MIN(q.id)`
    )
    .all<{ prompt: string }>(params)
    .map((row) => row.prompt)
}

/**
 * The batch on the eligible Topic with the most Notions that need attention, then the most that
 * are getting steadier: up to 3 of them, attention first. Null when no eligible Topic has one.
 */
export function planRecallBatch(
  db: Database,
  openingTopicId: number,
  language: GenerationLanguage
): RecallBatchPlan | null {
  const results = loadNotionResults(db)
  let best: { topicId: number; attention: number[]; steadier: number[] } | undefined
  for (const { topicId } of eligibleTopics(db, openingTopicId)) {
    const attention: number[] = []
    const steadier: number[] = []
    for (const notion of listNotionsByTopic(db, topicId)) {
      const status = classifyNotion(results.get(notion.id) ?? [])
      if (status === 'needs_attention') attention.push(notion.id)
      else if (status === 'steadier') steadier.push(notion.id)
    }
    if (attention.length === 0 && steadier.length === 0) continue
    if (
      !best ||
      attention.length > best.attention.length ||
      (attention.length === best.attention.length && steadier.length > best.steadier.length)
    ) {
      best = { topicId, attention, steadier }
    }
  }
  if (!best) return null
  const focusNotionIds = [...best.attention, ...best.steadier].slice(0, MAX_FOCUS_NOTIONS)
  return {
    kind: 'shaky',
    topicId: best.topicId,
    focusNotionIds,
    avoidPrompts: askedPrompts(db, focusNotionIds, language)
  }
}

/**
 * The batch on the eligible declared Topic passed earliest that has no recall quiz in the
 * Generation Language and no answered question, or null. Its Notion Outline is generated with the
 * batch when missing (declaring a Topic does not open it), and reused when an earlier batch
 * stored it but failed on its questions.
 */
export function planDeclaredBatch(
  db: Database,
  openingTopicId: number,
  language: GenerationLanguage
): RecallBatchPlan | null {
  const needsBatch = db.prepare(
    `SELECT 1 FROM declared_masteries d
     WHERE d.topic_id = $topicId
       AND NOT EXISTS (SELECT 1 FROM quizzes z
                       WHERE z.topic_id = d.topic_id AND z.purpose = 'recall'
                         AND z.language = $language)
       AND NOT EXISTS (SELECT 1 FROM attempts a
                       JOIN questions q ON q.id = a.question_id
                       JOIN quizzes z ON z.id = q.quiz_id
                       WHERE z.topic_id = d.topic_id)`
  )
  const topic = eligibleTopics(db, openingTopicId).find(
    ({ topicId }) => needsBatch.get({ topicId, language }) !== undefined
  )
  return topic
    ? { kind: 'declared', topicId: topic.topicId, focusNotionIds: [], avoidPrompts: [] }
    : null
}

async function runBatch(
  deps: PipelineDeps,
  plan: RecallBatchPlan,
  language: GenerationLanguage
): Promise<void> {
  const { db } = deps
  const slugById = new Map(listNotionsByTopic(db, plan.topicId).map((n) => [n.id, n.slug]))
  const focusNotions = plan.focusNotionIds.map((id) => slugById.get(id)!)
  // A declared Topic's Notion Outline is generated here, in the background as well.
  const request = await prepareQuiz(
    deps,
    plan.topicId,
    {
      count: RECALL_BATCH_SIZE,
      types: RECALL_BATCH_TYPES,
      ...(focusNotions.length > 0 && { focusNotions }),
      ...(plan.avoidPrompts.length > 0 && { avoidPrompts: plan.avoidPrompts })
    },
    { priority: 'background', language }
  )
  const result = (await deps.service.pregenerate(request).result) as GenerationResult<QuizContent>
  db.transaction(() => {
    // The same batch is already stored (served again from the Content Cache, same data).
    const stored = db
      .prepare(
        `SELECT 1 FROM quizzes WHERE topic_id = $topicId AND purpose = 'recall'
         AND content_cache_key = $key`
      )
      .get({ topicId: plan.topicId, key: result.cacheKey })
    if (!stored) saveQuiz(db, plan.topicId, result, language, 'recall')
  })
}

function logFailure(error: unknown): void {
  if (error instanceof GenerationError && error.code === 'cancelled') return
  console.error('Recall pre-generation failed', error)
}

/**
 * Plans and runs the batches of an opened Topic's Lesson. Never rejects: a failure is logged and
 * leaves the database as it was (a declared Topic may keep its new Notion Outline, reused by
 * the next batch).
 */
export async function generateRecallBatches(
  deps: PipelineDeps,
  openingTopicId: number,
  language: GenerationLanguage
): Promise<void> {
  let plans: RecallBatchPlan[]
  try {
    plans = [
      planRecallBatch(deps.db, openingTopicId, language),
      planDeclaredBatch(deps.db, openingTopicId, language)
    ].filter((plan) => plan !== null)
  } catch (error) {
    logFailure(error)
    return
  }
  await Promise.all(plans.map((plan) => runBatch(deps, plan, language).catch(logFailure)))
}

/** Starts the batches without waiting for them (the learner never waits for a recall batch). */
export function triggerRecallBatches(
  deps: PipelineDeps,
  openingTopicId: number,
  language: GenerationLanguage
): void {
  void generateRecallBatches(deps, openingTopicId, language)
}
