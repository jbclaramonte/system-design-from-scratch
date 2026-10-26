import type { MasteryState } from '../../../shared/mastery'

/**
 * Whether the Recall Quiz comes before the Lesson now shown by the Topic screen. Only before the
 * first opening of the Lesson of a Topic: the step is the initial Lesson (no Round yet, so never
 * a Remediation Lesson) and the Lesson was not generated yet. A Lesson read before, or a Topic
 * with a Round, never gets one. `lessonDone`: the Lesson was recorded during this visit;
 * `recallDone`: the Recall Quiz is over for this visit. The main process still decides whether
 * there is anything to recall.
 */
export const showsRecallGate = (state: MasteryState, lessonDone: boolean, recallDone: boolean) =>
  state.step.name === 'lesson' &&
  !state.step.lessonReady &&
  state.lastRound === null &&
  !lessonDone &&
  !recallDone

/**
 * Whether "I already know this" (Declared Mastery) is offered on the Topic screen: not over an
 * overlay, not during a Round, and not while the Recall Quiz is showing (the learner has not seen
 * the Lesson yet, and the gate must not be skipped by it).
 */
export const showsDeclareMastery = (
  state: MasteryState,
  { overlayOpen, recallGate }: { overlayOpen: boolean; recallGate: boolean }
) => state.canDeclare && !overlayOpen && state.step.name !== 'round' && !recallGate
