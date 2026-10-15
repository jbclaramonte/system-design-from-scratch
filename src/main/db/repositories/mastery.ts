// Mastery Loop data that is not a round or an attempt: the learner's choices at the Round Limit,
// and the topics the learner declared as already known (Declared Mastery).
import type { RoundLimitChoice } from '../../../shared/mastery'
import type { Database } from '../driver'
import type { DeclaredMasteryRow, RoundLimitChoiceRow } from '../types'
import { NOW, TIMESTAMP_COLUMNS } from './mapping'

/** Records (or changes) the choice made on a failed round that reached the Round Limit. */
export function setRoundLimitChoice(
  db: Database,
  roundId: number,
  choice: RoundLimitChoice
): RoundLimitChoiceRow {
  db.prepare(
    `INSERT INTO round_limit_choices (round_id, choice) VALUES ($roundId, $choice)
     ON CONFLICT (round_id) DO UPDATE SET choice = excluded.choice, updated_at = ${NOW}`
  ).run({ roundId, choice })
  return db
    .prepare(
      `SELECT round_id AS roundId, choice, ${TIMESTAMP_COLUMNS} FROM round_limit_choices
       WHERE round_id = $roundId`
    )
    .get<RoundLimitChoiceRow>({ roundId })!
}

/** Choices made on the rounds of a topic, by round order. */
export function listRoundLimitChoicesByTopic(db: Database, topicId: number): RoundLimitChoiceRow[] {
  return db
    .prepare(
      `SELECT c.round_id AS roundId, c.choice, c.created_at AS createdAt, c.updated_at AS updatedAt
       FROM round_limit_choices c JOIN rounds r ON r.id = c.round_id
       WHERE r.topic_id = $topicId ORDER BY r.number`
    )
    .all<RoundLimitChoiceRow>({ topicId })
}

/** The Declared Mastery of a topic, if the learner declared it as already known. */
export function getDeclaredMastery(db: Database, topicId: number): DeclaredMasteryRow | undefined {
  return db
    .prepare(
      'SELECT topic_id AS topicId, created_at AS createdAt FROM declared_masteries WHERE topic_id = $topicId'
    )
    .get<DeclaredMasteryRow>({ topicId })
}

/** Records the Declared Mastery of a topic; keeps the first timestamp when it already exists. */
export function declareMastery(db: Database, topicId: number): DeclaredMasteryRow {
  db.prepare('INSERT OR IGNORE INTO declared_masteries (topic_id) VALUES ($topicId)').run({
    topicId
  })
  return getDeclaredMastery(db, topicId)!
}

/** Removes the Declared Mastery of a topic. */
export function removeDeclaredMastery(db: Database, topicId: number): void {
  db.prepare('DELETE FROM declared_masteries WHERE topic_id = $topicId').run({ topicId })
}
