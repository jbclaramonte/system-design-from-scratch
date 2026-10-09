import { describe, expect, it } from 'vitest'
import type { StepFeedback } from '../../shared/protocol'
import { DESIGN_EXERCISES, referenceTermsFor } from './designExercises'
import { findLeakedTerms, leakRetryNote, redactLeakedEntries, stepFeedbackTexts } from './leakGuard'

const pastebinTerms = referenceTermsFor('pastebin', 'functional_requirements')
const twitterTerms = referenceTermsFor('twitter', 'functional_requirements')

// Excerpts of real step feedback (prompt version 3, docs/samples/design-exercises.md history).
const LEAKY_PASTEBIN =
  "Tu ne dis rien de ce qui est exclu (comptes, édition, lien personnalisé, etc.). Tu ne dis pas qui est l'utilisateur : anonyme ? Un texte qui n'expire jamais est plus simple ; une expiration demande un nettoyage."
const LEAKY_TWITTER =
  "Tu ne distingues pas la timeline d'accueil de la timeline d'un utilisateur. Tu ne dis pas ce qui est hors périmètre (par exemple analytics, paramètres de visibilité, flux externes). Il manque la recherche par mots-clés, la haute disponibilité et les notifications."
const CATEGORY_ONLY =
  "Tu ne dis pas ce qui est hors périmètre. Pense aux cas limites de tes cas d'usage. Qui d'autre que l'utilisateur agit sur le système ?"

const feedback = (changes: Partial<StepFeedback> = {}): StepFeedback => ({
  checklist: [{ verdict: 'partial', comment: 'À préciser.' }],
  summary: 'Un bon début.',
  gaps: [],
  errors: [],
  forgottenTradeOffs: [],
  nextStep: 'Précise le hors périmètre.',
  ...changes
})

describe('reference terms', () => {
  it('are curated for the first step of every catalogued exercise, without the g flag', () => {
    for (const exercise of DESIGN_EXERCISES) {
      const terms = exercise.referenceTerms.functional_requirements ?? []
      expect(terms.length).toBeGreaterThan(5)
      expect(new Set(terms.map((t) => t.id)).size).toBe(terms.length)
      for (const { pattern } of terms) expect(pattern.flags).toBe('i')
    }
    expect(referenceTermsFor('pastebin', 'high_level_design')).toEqual([])
    expect(referenceTermsFor('mint', 'functional_requirements')).toEqual([])
  })

  it('do not flag the categories the feedback is told to use, nor the problem statements', () => {
    expect(findLeakedTerms([CATEGORY_ONLY], '', pastebinTerms)).toEqual([])
    expect(findLeakedTerms([CATEGORY_ONLY], '', twitterTerms)).toEqual([])
    for (const exercise of DESIGN_EXERCISES) {
      const terms = exercise.referenceTerms.functional_requirements!
      expect(findLeakedTerms([exercise.problemStatement, exercise.title], '', terms)).toEqual([])
    }
  })
})

describe('findLeakedTerms', () => {
  it('finds the reference items of real leaky feedback', () => {
    expect(findLeakedTerms([LEAKY_PASTEBIN], '', pastebinTerms)).toEqual([
      'anonymous users',
      'custom short link (out of scope)',
      'deleting expired pastes',
      'editing (out of scope)',
      'expiration',
      'user accounts (out of scope)'
    ])
    expect(findLeakedTerms([LEAKY_TWITTER], '', twitterTerms)).toEqual([
      'analytics (out of scope)',
      'firehose and streams (out of scope)',
      'high availability',
      'home timeline',
      'keyword search',
      'push notifications',
      'user timeline',
      'visibility settings (out of scope)'
    ])
  })

  it('allows an item the learner wrote', () => {
    const learner = '- Hors périmètre : comptes utilisateurs\n- Les pastes expirent après un mois'
    expect(findLeakedTerms([LEAKY_PASTEBIN], learner, pastebinTerms)).not.toContain('expiration')
    expect(findLeakedTerms([LEAKY_PASTEBIN], learner, pastebinTerms)).not.toContain(
      'user accounts (out of scope)'
    )
  })

  it('reads every field of a step feedback', () => {
    const texts = stepFeedbackTexts(
      feedback({
        checklist: [{ verdict: 'missing', comment: 'Rien sur les notifications.' }],
        forgottenTradeOffs: ['Garder les analytics ?']
      })
    )
    expect(findLeakedTerms(texts, '', twitterTerms)).toEqual([
      'analytics (out of scope)',
      'push notifications'
    ])
  })
})

describe('redactLeakedEntries', () => {
  it('drops the list entries that still name a leaked term, keeps the rest', () => {
    const redacted = redactLeakedEntries(
      feedback({
        gaps: ['Tu ne dis pas si un paste expire.', 'Tu ne précises pas le hors périmètre.'],
        errors: ['Les comptes sont hors sujet.'],
        forgottenTradeOffs: ['Expiration contre stockage.']
      }),
      ['expiration'],
      pastebinTerms
    )
    expect(redacted.gaps).toEqual(['Tu ne précises pas le hors périmètre.'])
    expect(redacted.errors).toEqual(['Les comptes sont hors sujet.'])
    expect(redacted.forgottenTradeOffs).toEqual([])
    expect(redacted.summary).toBe('Un bon début.')
  })

  it('names the leaked items to the model on the retry and asks for categories', () => {
    expect(leakRetryNote(['expiration'])).toMatch(/\(expiration\).*category only/s)
  })
})
