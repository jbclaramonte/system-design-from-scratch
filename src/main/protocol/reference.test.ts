import { describe, expect, it } from 'vitest'
import { corpusPath, loadCorpus } from '../corpus'
import { activeStepsFor, protocolSteps } from '../../shared/protocol'
import { REFERENCE_PARTS_BY_STEP, referenceForSteps } from './reference'

const corpus = loadCorpus(corpusPath(process.cwd()))
const pastebin = corpus.getReferenceSolution('pastebin')!
const twitter = corpus.getReferenceSolution('twitter')!
const step = (id: string) => (solution: typeof pastebin) =>
  solution.steps.find((s) => s.id.startsWith(id))!.markdown.trim()

describe('referenceForSteps', () => {
  it('gives only the use cases for functional requirements', () => {
    const text = referenceForSteps(pastebin, ['functional_requirements'])
    expect(text).toContain('# Design Pastebin.com (or Bit.ly)')
    expect(text).toContain('Protocol Steps: Functional requirements.')
    expect(text).toContain(pastebin.useCases.trim())
    expect(text).toContain('#### Out of scope')
    expect(text).not.toContain('10 million users')
    expect(text).not.toContain(step('step-3-')(pastebin))
  })

  it('leaves the numbers out of exercise 1 (no estimations step)', () => {
    const text = referenceForSteps(pastebin, activeStepsFor(1))
    expect(text).toContain(pastebin.useCases.trim())
    expect(text).toContain(step('step-3-')(pastebin))
    expect(text).not.toContain('Calculate usage')
    expect(text).not.toContain('12.7 GB')
    expect(text).not.toContain(step('step-4-')(pastebin))
  })

  it('gives the back-of-the-envelope section to the estimations of exercise 2', () => {
    const text = referenceForSteps(twitter, ['functional_requirements', 'estimations'])
    expect(text).toContain('#### Calculate usage')
    expect(text).toContain('100 thousand read requests per second')
    expect(text).toContain('6,000 tweets per second')
    expect(text).toMatch(/judge the method/i)
    expect(text.indexOf('Use cases')).toBeLessThan(text.indexOf('Constraints'))
  })

  it('keeps part order and drops duplicates', () => {
    const text = referenceForSteps(twitter, ['high_level_design', 'api', 'data_model'])
    expect(text.split(step('step-3-')(twitter))).toHaveLength(2)
    expect(text.indexOf('## High-level design')).toBeLessThan(text.indexOf('## Core components'))
  })

  it('maps every step to at least one part found in every primer solution', () => {
    for (const s of protocolSteps) expect(REFERENCE_PARTS_BY_STEP[s].length).toBeGreaterThan(0)
    for (const solution of corpus.listReferenceSolutions()) {
      const text = referenceForSteps(solution, protocolSteps)
      for (const heading of [
        'Use cases',
        'Constraints',
        'Core components',
        'Scaling the design',
        'Additional talking points'
      ]) {
        expect(text, `${solution.id}: ${heading}`).toContain(`## ${heading}`)
      }
    }
  })
})
