import type { Migration } from '../migrate'
import { initialSchema } from './0001-initial-schema'
import { notionSourcesAndQuestionFlags } from './0002-notion-sources-and-question-flags'
import { masteryLoop } from './0003-mastery-loop'
import { interviewProtocol } from './0004-interview-protocol'

/** Every migration, in order. Append new ones; never edit or reorder an applied one. */
export const migrations: readonly Migration[] = [
  initialSchema,
  notionSourcesAndQuestionFlags,
  masteryLoop,
  interviewProtocol
]
