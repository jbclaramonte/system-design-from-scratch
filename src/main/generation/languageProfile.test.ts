import { describe, expect, it } from 'vitest'
import { checkDiagramSource } from '../../shared/diagramSource'
import { generationLanguages, type GenerationLanguage } from '../../shared/generationLanguage'
import { findMermaidBlocks } from './diagrams'
import { languageProfile, type LanguageProfile } from './languageProfile'
import { diagramRules, languageRules, quizDiagramRules, ungroundedRules } from './prompts'
import { buildAllPrompts } from './testing/promptFixtures'

/** Every string of a profile, with its path, for the "no residue of the other language" check. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]]
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`))
}

const otherOf = (language: GenerationLanguage) => (language === 'fr' ? 'en' : 'fr')

/** Profile fields that name the language itself: they legitimately appear in both. */
const NAMES = new Set(['.code', '.name', '.nameWithArticle'])

/** Fields whose text is ordinary English in the other language too ("for example"). */
const GENERIC = new Set(['.designFeedback.forExample'])

describe('language profiles', () => {
  it('have the same fields in every language, all filled', () => {
    const paths = (profile: LanguageProfile) => leaves(profile).map(([path]) => path)
    expect(paths(languageProfile('en'))).toEqual(paths(languageProfile('fr')))
    for (const language of generationLanguages) {
      for (const [path, text] of leaves(languageProfile(language))) {
        expect(text.trim(), `${language}${path}`).not.toBe('')
      }
    }
  })

  it('give the output rules of their language: address form, jargon, everyday words', () => {
    expect(languageRules('fr')).toContain('addressing the learner as "tu"')
    expect(languageRules('fr')).toContain('Keep only system design jargon in English')
    expect(languageRules('fr')).toContain('serveur, client, requête, réponse, mémoire')
    expect(languageRules('en')).toContain('Write everything the learner reads in English')
    expect(languageRules('en')).toContain('addressing the learner as "you"')
    // English has no translation rule: nothing to keep in another language.
    expect(languageRules('en')).not.toMatch(/never translate|in French/i)
    expect(languageRules('en')).toContain('server, client, request, response, memory, disk')
  })

  it.each(generationLanguages)(
    'give %s Mermaid examples that pass the renderer checks',
    (language) => {
      const examples = findMermaidBlocks(diagramRules(language))
      expect(examples.map((block) => checkDiagramSource(block.source))).toEqual([
        { ok: true, type: 'flowchart' },
        { ok: true, type: 'sequenceDiagram' }
      ])
      const quizExample = languageProfile(language).quizDiagram.example
      expect(checkDiagramSource(quizExample)).toEqual({ ok: true, type: 'flowchart' })
    }
  )

  it.each(generationLanguages)(
    'keep the label language of %s diagrams in the examples',
    (language) => {
      const { diagram } = languageProfile(language)
      expect(diagramRules(language)).toContain(
        `Labels follow the language rules: ${diagram.labelPolicy}.`
      )
      expect(quizDiagramRules(language)).toContain(
        languageProfile(language).quizDiagram.answerWords
      )
      expect(ungroundedRules(language)).toContain(
        languageProfile(language).ungrounded.approximately
      )
    }
  )
})

describe.each(generationLanguages)('every prompt in %s', (language) => {
  const other = otherOf(language)
  const prompts = buildAllPrompts(language)
  const profile = languageProfile(language)
  /** Strings of the other profile that the profile of this language does not contain. */
  const foreign = leaves(languageProfile(other)).filter(
    ([path, text]) =>
      !NAMES.has(path) &&
      !GENERIC.has(path) &&
      text.length >= 5 &&
      !leaves(profile).some(([, own]) => own.includes(text) || text.includes(own))
  )

  it('is built for the language, with the whole prompt set', () => {
    expect(Object.keys(prompts)).toContain('lesson-grounded')
    expect(Object.keys(prompts)).toContain('final-review')
    expect(Object.keys(prompts).length).toBeGreaterThan(35)
  })

  it.each(Object.entries(prompts))(
    'asks for %s in the language, with its output rules',
    (name, prompt) => {
      const text = `${prompt.system}\n${prompt.user}`
      if (name === 'diagram-repair') {
        // The repair only fixes the syntax of diagrams, in their language.
        expect(text).toContain(profile.diagram.labelPolicy)
        return
      }
      expect(text).toContain(languageRules(language))
      expect(text).not.toContain(languageRules(otherOf(language)))
    }
  )

  it.each(Object.entries(prompts))(
    'has no instruction of the other language in %s',
    (name, prompt) => {
      const text = `${prompt.system}\n${prompt.user}`
      for (const [path, residue] of foreign) {
        expect(text, `${other}${path} in ${name}`).not.toContain(residue)
      }
      if (language === 'en') {
        // Besides what says the learner may write in French, French is not named.
        const withoutNote = text
          .replace(profile.learnerTextNote, '')
          .replace(profile.freeAnswer.tolerance, '')
        expect(withoutNote).not.toMatch(/\bFrench\b/)
        expect(withoutNote).not.toMatch(/[àâçéèêëîïôùûœ]/i)
      }
    }
  )

  it('writes the requested language in the headings, prefixes and output reminders', () => {
    const { lesson, remediation, protocolStepLesson, designFeedback } = profile
    expect(prompts['lesson-grounded']!.user).toContain(`## ${lesson.recapHeading}`)
    expect(prompts['lesson-grounded']!.user).toContain(`<topic title in ${profile.name}>`)
    expect(prompts['remediation-analogy']!.user).toContain(`**${remediation.takeawaysHeading}**`)
    const step = prompts['protocol-step-api']!.user
    for (const heading of [
      protocolStepLesson.why,
      protocolStepLesson.produce,
      protocolStepLesson.pitfall
    ]) {
      expect(step).toContain(`### ${heading}`)
    }
    expect(step).toContain(`<${profile.name} title of the step>`)
    expect(prompts['quiz-grounded']!.user).toContain(`in ${profile.name}, self-contained`)
    expect(prompts['quiz-grounded']!.user).toContain(`${profile.name} sentences`)
    expect(prompts['quiz-grounded']!.system).toContain(
      `${profile.nameWithArticle} system design learning app`
    )
    expect(prompts['outline-grounded']!.user).toContain(`short ${profile.name} title`)
    expect(prompts['step-feedback-text']!.user).toContain(`${profile.name} output.`)
    expect(prompts['final-review']!.user).toContain(`${profile.name} output.`)
    expect(prompts['final-review']!.system).toContain(designFeedback.finalReviewPrefixes)
    expect(prompts['step-feedback-text']!.system).toContain(designFeedback.gapPointer)
    expect(prompts['free-answer']!.user).toContain(`Question (${profile.name}):`)
    expect(prompts['lesson-question-lesson']!.system).toContain(
      profile.lessonQuestion.notCoveredExample
    )
  })

  it('tells the free-answer grader and the design feedback to answer in the language, whatever the learner wrote', () => {
    const { learnerTextNote } = profile
    for (const name of [
      'free-answer',
      'free-answer-contest',
      'step-feedback-text',
      'step-feedback-canvas',
      'hint-1',
      'final-review'
    ]) {
      expect(prompts[name]!.system, name).toContain(learnerTextNote)
    }
    expect(learnerTextNote).toContain(`always in ${profile.name}`)
  })
})
