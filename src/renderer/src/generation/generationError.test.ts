// Message table, truncation, and the server-side rendering (react-dom/server, no DOM) of the
// shared Generation error display. Effects do not run, so nothing is logged here.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { generationErrorCodes } from '../../../shared/generation'
import { OpenSettingsContext } from '../settings/openSettings'
import {
  generationErrorText,
  MAX_DETAILS_LENGTH,
  truncateDetails,
  type DisplayedErrorCode
} from './generationErrorText'
import { GenerationErrorView } from './GenerationErrorView'

describe('generationErrorText', () => {
  it('has a title and one or two short sentences for every code', () => {
    for (const code of generationErrorCodes) {
      const { title, advice } = generationErrorText(code)
      expect(title.length).toBeGreaterThan(0)
      expect(advice.length).toBeLessThan(200)
      expect(advice.split(/[.:;] /).length).toBeLessThanOrEqual(3)
    }
  })

  it('offers Settings only where Settings can fix it', () => {
    const settings = generationErrorCodes.filter((code) => generationErrorText(code).openSettings)
    expect(settings).toEqual(['cli_not_found', 'not_logged_in'])
  })

  it('keeps the message of a refused call as its advice', () => {
    expect(generationErrorText('refused', 'The round is completed.')).toMatchObject({
      advice: 'The round is completed.',
      openSettings: false
    })
  })
})

describe('truncateDetails', () => {
  it('keeps a short message as it is', () => {
    expect(truncateDetails('  CLI exited with code 1  ')).toBe('CLI exited with code 1')
  })

  it('cuts a long message and says how much was left out', () => {
    const raw = 'x'.repeat(MAX_DETAILS_LENGTH + 500)
    const shown = truncateDetails(raw)
    expect(shown.startsWith('x'.repeat(MAX_DETAILS_LENGTH))).toBe(true)
    expect(shown).not.toContain('x'.repeat(MAX_DETAILS_LENGTH + 1))
    expect(shown).toContain('500 more characters')
    expect(truncateDetails('abcdef', 3)).toMatch(/^abc\n… 3 more characters/)
  })
})

describe('GenerationErrorView', () => {
  const render = (
    code: DisplayedErrorCode,
    message: string,
    openSettings: (() => void) | null = () => {}
  ) =>
    renderToStaticMarkup(
      createElement(
        OpenSettingsContext.Provider,
        { value: openSettings },
        createElement(GenerationErrorView, { code, message, testId: 'error', onRetry: () => {} })
      )
    )

  it('shows the short advice first and folds a long raw message', () => {
    const raw = `Claude Code exited: ${'{"type":"result","is_error":true} '.repeat(200)}`
    const html = render('unknown', raw)

    expect(html).toContain('The generation failed')
    expect(html).toContain('Retry')
    // Collapsed: no `open` attribute on the disclosure.
    expect(html).toMatch(/<details data-testid="error-details"><summary>Technical details/)
    expect(html).toContain('more characters')
    expect(html.indexOf('error-advice')).toBeLessThan(html.indexOf('Technical details'))
  })

  it('offers Open Settings for a not_logged_in or cli_not_found error only', () => {
    expect(render('not_logged_in', 'Failed to authenticate')).toContain('Open Settings')
    expect(render('cli_not_found', 'ENOENT')).toContain('Open Settings')
    expect(render('unknown', 'boom')).not.toContain('Open Settings')
  })

  it('still explains without a way to open the settings', () => {
    const html = render('not_logged_in', 'Failed to authenticate', null)

    expect(html).toContain('logged in')
    expect(html).not.toContain('Open Settings')
  })

  it('shows no technical details for a cancellation or a refused call', () => {
    expect(render('cancelled', 'The generation was cancelled.')).not.toContain('Technical details')
    expect(render('refused', 'The round is completed.')).not.toContain('Technical details')
  })
})
