import type { Migration } from '../migrate'
import { initialSchema } from './0001-initial-schema'
import { notionSourcesAndQuestionFlags } from './0002-notion-sources-and-question-flags'
import { masteryLoop } from './0003-mastery-loop'
import { interviewProtocol } from './0004-interview-protocol'
import { questionClarifications } from './0005-question-clarifications'
import { forcedUnlocks } from './0006-forced-unlocks'
import { declaredMasteries } from './0007-declared-masteries'
import { generationLanguage } from './0008-generation-language'
import { languageChosenMarker } from './0009-language-chosen-marker'
import { celebratedBadges } from './0010-celebrated-badges'

/** Every migration, in order. Append new ones; never edit or reorder an applied one. */
export const migrations: readonly Migration[] = [
  initialSchema,
  notionSourcesAndQuestionFlags,
  masteryLoop,
  interviewProtocol,
  questionClarifications,
  forcedUnlocks,
  declaredMasteries,
  generationLanguage,
  languageChosenMarker,
  celebratedBadges
]
