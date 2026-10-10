// Pure logic of the Lesson reading panel (#35): when the topic screen offers it, and the
// selectable readings (the Lesson, then the Remediation Lessons, newest round first).
import type { LessonReview, MasteryState, ReviewedLesson } from '../../../shared/mastery'
import { angleLabels } from './masteryText'

/** The screens on top of the loop state (see `TopicScreen`). */
export type ReviewOverlayName = 'preparing' | 'play' | 'results'

/**
 * Whether the topic header offers the Lesson button. In the plain `lesson` step the Lesson is the
 * screen itself, so there is nothing to reopen; once the quiz is being prepared or played (or
 * any later step) the Lesson exists as soon as the loop state says so. Before the Lesson is
 * recorded there is nothing to read: no button.
 */
export function canReviewLesson(
  { step }: Pick<MasteryState, 'step'>,
  overlay: ReviewOverlayName | null
): boolean {
  if (step.name !== 'lesson') return true
  return overlay !== null && step.lessonReady
}

export type ReviewKey = 'lesson' | `remediation:${number}`

export interface ReviewTab {
  key: ReviewKey
  kind: 'lesson' | 'remediation'
  /** "Lesson", or the French notion title of a Remediation Lesson. */
  title: string
  /** Remediation Lessons: "Round 2 · Analogy" ("Remediation Lesson · ..." when the round is unknown). */
  detail: string | null
  reading: ReviewedLesson
}

/** The Lesson first, then the Remediation Lessons in the order given (newest round first). */
export function reviewTabs(review: LessonReview): ReviewTab[] {
  const tabs: ReviewTab[] = []
  if (review.lesson) {
    tabs.push({
      key: 'lesson',
      kind: 'lesson',
      title: 'Lesson',
      detail: null,
      reading: review.lesson
    })
  }
  for (const lesson of review.remediationLessons) {
    const round = lesson.roundNumber === null ? 'Remediation Lesson' : `Round ${lesson.roundNumber}`
    tabs.push({
      key: `remediation:${lesson.id}`,
      kind: 'remediation',
      title: lesson.notion.title,
      detail: `${round} · ${angleLabels[lesson.angle]}`,
      reading: lesson
    })
  }
  return tabs
}

/** The selected tab: the requested one, or the first when it is gone. */
export function selectedTab(tabs: readonly ReviewTab[], key: ReviewKey | null): ReviewTab | null {
  return tabs.find((tab) => tab.key === key) ?? tabs[0] ?? null
}
