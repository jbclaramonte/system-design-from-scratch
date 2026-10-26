/**
 * Which Topics a Recall Quiz may draw from: the Topics the learner passed, minus the most recently
 * passed one (still fresh) and the one being opened. Pure functions over loaded rows.
 */

export interface PassedTopic {
  topicId: number
  /** ISO 8601 time the Topic counted as passed. */
  passedAt: string
}

/**
 * A Topic is passed by a Round with `passed = true` or by a Declared Mastery; its passed date is
 * the earliest of the first passing Round completion and the declaration. Each Topic appears once.
 */
export function passedTopics(input: {
  rounds: readonly { topicId: number; completedAt: string | null; passed: boolean | null }[]
  declared: readonly { topicId: number; createdAt: string }[]
}): PassedTopic[] {
  const earliest = new Map<number, string>()
  const note = (topicId: number, at: string) => {
    const current = earliest.get(topicId)
    if (current === undefined || Date.parse(at) < Date.parse(current)) earliest.set(topicId, at)
  }
  for (const round of input.rounds) {
    if (round.passed === true && round.completedAt !== null) note(round.topicId, round.completedAt)
  }
  for (const declaration of input.declared) note(declaration.topicId, declaration.createdAt)
  return [...earliest].map(([topicId, passedAt]) => ({ topicId, passedAt }))
}

/** Passed Topics minus the one passed latest (by date, not by path order) and the opening one. */
export function eligibleTopicIds(passed: readonly PassedTopic[], openingTopicId: number): number[] {
  let latest: PassedTopic | undefined
  for (const topic of passed) {
    if (latest === undefined || Date.parse(topic.passedAt) > Date.parse(latest.passedAt)) {
      latest = topic
    }
  }
  return passed
    .filter((topic) => topic !== latest && topic.topicId !== openingTopicId)
    .map((topic) => topic.topicId)
}
