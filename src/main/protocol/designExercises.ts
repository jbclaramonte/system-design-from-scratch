// The Design Exercises of the Learning Path, as data: order, title, the curated problem statement
// and the primer Reference Solution of each. Seeded into `design_exercises` at startup (insert
// only). Rules and statements policy in docs/Design Exercises.md.
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { createDesignExercise, listDesignExercises } from '../db/repositories/designPractice'
import type { ProtocolStep } from '../../shared/protocol'
import type { ReferenceTerm } from './leakGuard'

export interface DesignExerciseDefinition {
  /** `design_exercises.slug`, also the Reference Solution id (`pastebin`). */
  slug: string
  /** 1-based exercise index: decides the active Protocol Steps (`activeStepsFor`). */
  orderIndex: number
  /** The interview question, as the primer titles it (UI text). */
  title: string
  /**
   * What the learner is asked to design, in French. Curated, never generated: the product and its
   * context only, no use case and no number (scoping and estimating are the learner's steps, and
   * the primer's Step 1 is their reference answer).
   */
  problemStatement: string
  referenceSolutionId: string
  /**
   * Distinctive items of the Reference Solution per step, which step feedback must not name
   * unless the learner did (`findLeakedTerms`). Curated by hand from the primer's Step 1.
   */
  referenceTerms: Partial<Record<ProtocolStep, readonly ReferenceTerm[]>>
}

// Patterns match French and English wordings (stems), case-insensitive, without the `g` flag.
const PASTEBIN_USE_CASE_TERMS: readonly ReferenceTerm[] = [
  { id: 'expiration', pattern: /expir|durée de vie|pour toujours|périmé/i },
  { id: 'anonymous users', pattern: /anonym/i },
  { id: 'page analytics', pattern: /analytic|statisti|nombre de visites|monthly visit/i },
  { id: 'deleting expired pastes', pattern: /nettoy|purge|delete expired/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  {
    id: 'user accounts (out of scope)',
    pattern: /\bcomptes?\b|account|inscri|connect[ée]|\blog ?in\b|authentif/i
  },
  { id: 'email verification (out of scope)', pattern: /e-?mail/i },
  { id: 'editing (out of scope)', pattern: /édit|\bedit|modifi/i },
  { id: 'visibility (out of scope)', pattern: /visibilit|priv[ée]/i },
  { id: 'custom short link (out of scope)', pattern: /personnalis|custom|alias/i }
]

const TWITTER_USE_CASE_TERMS: readonly ReferenceTerm[] = [
  { id: 'fan-out to followers', pattern: /fan-?out|diffus/i },
  { id: 'push notifications', pattern: /notif/i },
  { id: 'emails', pattern: /e-?mail/i },
  {
    id: 'user timeline',
    pattern: /user timeline|timeline (d'un|de l'|du |personnelle)|ses propres tweets|profil/i
  },
  { id: 'home timeline', pattern: /home timeline|accueil/i },
  { id: 'keyword search', pattern: /mots?[- ]cl[ée]|keyword/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'firehose and streams (out of scope)', pattern: /firehose|flux externe|\bstreams?\b/i },
  { id: 'visibility settings (out of scope)', pattern: /visibilit|masqu|\bhide\b/i },
  { id: 'replies (out of scope)', pattern: /@ ?repl|\brepl(y|ies)\b|réponses? (à|aux) /i },
  { id: 'analytics (out of scope)', pattern: /analytic|statisti/i }
]

/** In exercise order. Prerequisite topics: `DESIGN_EXERCISE_PREREQUISITES` (src/main/path). */
export const DESIGN_EXERCISES: readonly DesignExerciseDefinition[] = [
  {
    slug: 'pastebin',
    orderIndex: 1,
    title: 'Design Pastebin.com (or Bit.ly)',
    problemStatement:
      "Tu conçois un service web de partage de texte comme Pastebin.com : on y dépose du texte (du code, des logs, une note) pour le partager avec d'autres personnes grâce à un lien. Bit.ly, qui raccourcit des URL, est un problème très proche. Avant de dessiner quoi que ce soit, cadre ce que le service doit faire, et ce qu'il ne fera pas.",
    referenceSolutionId: 'pastebin',
    referenceTerms: { functional_requirements: PASTEBIN_USE_CASE_TERMS }
  },
  {
    slug: 'twitter',
    orderIndex: 2,
    title: 'Design the Twitter timeline and search',
    problemStatement:
      "Tu conçois le cœur d'un réseau social comme Twitter : chacun y publie des messages courts et suit d'autres personnes pour lire ce qu'elles publient. On te demande la partie timeline et la recherche. Aucun chiffre de trafic n'est donné : pose tes propres hypothèses, estime les ordres de grandeur, puis dessine.",
    referenceSolutionId: 'twitter',
    referenceTerms: { functional_requirements: TWITTER_USE_CASE_TERMS }
  }
]

export const designExerciseBySlug = (slug: string): DesignExerciseDefinition | undefined =>
  DESIGN_EXERCISES.find((exercise) => exercise.slug === slug)

/** Leak guard terms of a step, by Reference Solution (dev fixtures share their reference's). */
export const referenceTermsFor = (
  referenceSolutionId: string | null,
  step: ProtocolStep
): readonly ReferenceTerm[] =>
  DESIGN_EXERCISES.find((exercise) => exercise.referenceSolutionId === referenceSolutionId)
    ?.referenceTerms[step] ?? []

/** The exercise to complete before `slug` unlocks: the one just before it, null for the first. */
export function previousDesignExercise(slug: string): DesignExerciseDefinition | null {
  const exercise = designExerciseBySlug(slug)
  if (!exercise) return null
  return DESIGN_EXERCISES.find(({ orderIndex }) => orderIndex === exercise.orderIndex - 1) ?? null
}

/**
 * Inserts the Design Exercises missing from the database (`position` = order index). Never
 * updates an existing row, so a learner's exercise keeps its id and history. Returns the number
 * inserted.
 */
export function seedDesignExercises(
  db: Database,
  corpus: Corpus,
  exercises: readonly DesignExerciseDefinition[] = DESIGN_EXERCISES
): number {
  const existing = new Set(listDesignExercises(db).map(({ slug }) => slug))
  const missing = exercises.filter(({ slug }) => !existing.has(slug))
  db.transaction(() => {
    for (const exercise of missing) {
      if (!corpus.getReferenceSolution(exercise.referenceSolutionId)) {
        throw new Error(
          `Design Exercise ${exercise.slug}: Reference Solution ${exercise.referenceSolutionId} is not in the corpus.`
        )
      }
      createDesignExercise(db, {
        slug: exercise.slug,
        title: exercise.title,
        position: exercise.orderIndex,
        grounded: true,
        referenceSolutionSection: exercise.referenceSolutionId,
        problemStatement: exercise.problemStatement
      })
    }
  })
  return missing.length
}
