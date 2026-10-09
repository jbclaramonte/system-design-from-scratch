// Mastery Loop state machine. Pure: the state of a topic is derived from a snapshot of the
// database (rounds, their per-notion scores, Remediation Lessons, Round Limit choices, settings),
// so it survives restarts. Rules in docs/Mastery Loop Implementation.md.
import {
  remediationAngles,
  type MasteryStep,
  type RemediationAngle,
  type RemediationTarget,
  type RoundLimitChoice,
  type TopicMastery
} from '../../shared/mastery'
import type { NotionScore } from '../../shared/quiz'

export interface RoundSnapshot {
  id: number
  quizId: number
  number: number
  completed: boolean
  /** Stored at completion against the threshold of that time; null while open. */
  passed: boolean | null
  /** Per-notion scores of a completed round (empty while open). */
  notionScores: NotionScore[]
}

export interface MasterySnapshot {
  /** The topic has a recorded lesson (the learner opened it). */
  lessonReady: boolean
  /** Every round of the topic, any order. */
  rounds: RoundSnapshot[]
  /** Recorded Remediation Lessons: the round that triggered them and their notion. */
  remediations: { roundId: number; notionId: number }[]
  choices: { roundId: number; choice: RoundLimitChoice }[]
  masteryThreshold: number
  roundLimit: number
}

export interface DerivedMastery {
  status: TopicMastery
  step: MasteryStep
  /** Number of the open round, or of the next round to play. */
  roundNumber: number
  /** Completed rounds below the threshold since the last passed round. */
  failedRounds: number
  /** Latest completed round. */
  lastRoundId: number | null
}

/**
 * Notions missed in a round: per-notion score below the Mastery Threshold. When a failed round
 * has none (possible below 100%: a question on several notions counts for each), the notions
 * with at least one wrong answer are targeted instead, so a failed round always has remediation.
 */
export function missedNotions(scores: readonly NotionScore[], threshold: number): NotionScore[] {
  const belowThreshold = scores.filter((notion) => notion.scorePercent < threshold)
  return belowThreshold.length > 0 ? belowThreshold : scores.filter((notion) => notion.missed)
}

/**
 * Angle of the next Remediation Lesson on a notion that already had `previous` of them: the
 * angles in order, so each new one is an angle not used yet (they cycle once all were used).
 */
export const remediationAngle = (previous: number): RemediationAngle =>
  remediationAngles[previous % remediationAngles.length]!

const usedAnglesBefore = (previous: number): RemediationAngle[] => [
  ...new Set(Array.from({ length: previous }, (_, i) => remediationAngle(i)))
]

/** Completed rounds below the threshold since the last passed one (the Round Limit count). */
export function failedRoundsSinceLastPass(completed: readonly RoundSnapshot[]): number {
  let count = 0
  for (let i = completed.length - 1; i >= 0 && completed[i]!.passed === false; i--) count++
  return count
}

function remediationTargets(
  snapshot: MasterySnapshot,
  round: RoundSnapshot,
  numberOf: Map<number, number>
): RemediationTarget[] {
  return missedNotions(round.notionScores, snapshot.masteryThreshold).map((notion) => {
    // Earlier rounds that had a Remediation Lesson on this notion.
    const previous = new Set(
      snapshot.remediations
        .filter((r) => r.notionId === notion.id && (numberOf.get(r.roundId) ?? 0) < round.number)
        .map((r) => r.roundId)
    ).size
    return {
      notion: { id: notion.id, slug: notion.slug, title: notion.title },
      scorePercent: notion.scorePercent,
      angle: remediationAngle(previous),
      usedAngles: usedAnglesBefore(previous),
      ready: snapshot.remediations.some((r) => r.roundId === round.id && r.notionId === notion.id)
    }
  })
}

/** The state of a topic in the Mastery Loop. */
export function deriveMastery(snapshot: MasterySnapshot): DerivedMastery {
  const rounds = [...snapshot.rounds].sort((a, b) => a.number - b.number)
  const completed = rounds.filter((round) => round.completed)
  const last = completed.at(-1)
  const highest = rounds.at(-1)?.number ?? 0
  // A round left open before a later round completed (another quiz played meanwhile) is stale.
  const open = rounds.filter((round) => !round.completed && round.number > (last?.number ?? 0))
  const current = open.at(-1)
  const failedRounds = failedRoundsSinceLastPass(completed)
  const base = { failedRounds, lastRoundId: last?.id ?? null, roundNumber: highest + 1 }

  if (current) {
    return {
      ...base,
      status: 'in_progress',
      step: { name: 'round', roundId: current.id, quizId: current.quizId },
      roundNumber: current.number
    }
  }
  if (!last) {
    return {
      ...base,
      status: snapshot.lessonReady || rounds.length > 0 ? 'in_progress' : 'not_started',
      step: { name: 'lesson', lessonReady: snapshot.lessonReady }
    }
  }
  if (last.passed) {
    return { ...base, status: 'mastered', step: { name: 'mastered', roundId: last.id } }
  }

  const choice = snapshot.choices.find((c) => c.roundId === last.id)?.choice
  if (choice === 'skip') {
    return { ...base, status: 'skipped', step: { name: 'skipped', roundId: last.id } }
  }
  if (!choice && failedRounds >= snapshot.roundLimit) {
    return { ...base, status: 'limit_reached', step: { name: 'limit_reached', roundId: last.id } }
  }
  const numberOf = new Map(rounds.map((round) => [round.id, round.number]))
  return {
    ...base,
    status: 'in_progress',
    step: {
      name: 'remediation',
      roundId: last.id,
      anotherAngle: choice === 'another_angle',
      targets: remediationTargets(snapshot, last, numberOf)
    }
  }
}

/** Why the next round cannot start now, or null when it can. */
export function cannotStartRound(step: MasteryStep): string | null {
  switch (step.name) {
    case 'lesson':
      return step.lessonReady ? null : 'Read the lesson before the first quiz.'
    case 'round':
      return null
    case 'remediation':
      return step.targets.every((target) => target.ready)
        ? null
        : 'Read the Remediation Lessons before the next round.'
    case 'limit_reached':
      return 'The Round Limit is reached: choose another angle or skip the topic.'
    case 'skipped':
      return 'The topic was skipped: choose another angle to come back to it.'
    case 'mastered':
      return 'The topic is already mastered.'
  }
}

/** Why a Round Limit choice is refused now, or null when it is allowed. */
export function cannotChoose(step: MasteryStep, choice: RoundLimitChoice): string | null {
  if (step.name === 'limit_reached') return null
  // Coming back to a skipped topic resumes it with another angle.
  if (step.name === 'skipped' && choice === 'another_angle') return null
  return 'There is no Round Limit choice to make now.'
}
