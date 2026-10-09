// Leak guard of step feedback: the feedback must not name Reference Solution items the learner did
// not write (a gap points at a category, never at the reference's own item). Each Design Exercise
// lists the distinctive items of its reference per Protocol Step, as curated patterns that match
// their French or English wording. Rules and limits in docs/Interview Protocol Implementation.md.
import type { StepFeedback } from '../../shared/protocol'

/** A distinctive item of a Reference Solution, for example its expiration use case. */
export interface ReferenceTerm {
  /** Stable id, also how the item is named back to the model on a retry (English). */
  id: string
  /** Matches the item in French or English, case-insensitive. */
  pattern: RegExp
}

/** Every text of a step feedback, in field order. */
export const stepFeedbackTexts = (feedback: StepFeedback): string[] => [
  feedback.summary,
  ...feedback.checklist.map((entry) => entry.comment),
  ...feedback.gaps,
  ...feedback.errors,
  ...feedback.forgottenTradeOffs,
  feedback.nextStep
]

/**
 * Ids of the terms found in `texts` but not in `allowed` (what the learner wrote, the problem
 * statement): reference items the output brought in by itself. Sorted, each once.
 */
export function findLeakedTerms(
  texts: readonly string[],
  allowed: string,
  terms: readonly ReferenceTerm[]
): string[] {
  const output = texts.join('\n')
  return terms
    .filter(({ pattern }) => pattern.test(output) && !pattern.test(allowed))
    .map(({ id }) => id)
    .sort()
}

/** Said to the model on the retry after a leak. */
export function leakRetryNote(leaked: readonly string[]): string {
  return `Your previous feedback named items of the hidden Reference Solution that the learner did not write (${leaked.join(', ')}). Write the whole feedback again without naming them, nor any other item, example or number of the reference the learner did not write: point at the category only (for example "what is out of scope", "edge cases of the use cases", "the other actors").`
}

/**
 * Last resort after the retry: drops the list entries (gaps, errors, forgotten trade-offs) that
 * still name a leaked term. Sentences of the summary, checklist comments and next step are kept
 * (removing them could leave a verdict without its reason).
 */
export function redactLeakedEntries(
  feedback: StepFeedback,
  leaked: readonly string[],
  terms: readonly ReferenceTerm[]
): StepFeedback {
  const patterns = terms.filter(({ id }) => leaked.includes(id)).map(({ pattern }) => pattern)
  const keep = (entry: string) => !patterns.some((pattern) => pattern.test(entry))
  return {
    ...feedback,
    gaps: feedback.gaps.filter(keep),
    errors: feedback.errors.filter(keep),
    forgottenTradeOffs: feedback.forgottenTradeOffs.filter(keep)
  }
}
