import { describe, expect, it } from 'vitest'
import {
  availableMessage,
  checkResultMessage,
  downloadPercent,
  isBannerVisible,
  menuCheckNotice,
  progressLabel
} from './updateText'

describe('progressLabel', () => {
  it('shows the download percentage when the size is known', () => {
    expect(progressLabel(null)).toBe('Downloading the update...')
    expect(progressLabel({ phase: 'downloading', receivedBytes: 0, totalBytes: null })).toBe(
      'Downloading the update...'
    )
    expect(progressLabel({ phase: 'downloading', receivedBytes: 42, totalBytes: 100 })).toBe(
      'Downloading the update... 42%'
    )
  })

  it('names every other phase', () => {
    expect(progressLabel({ phase: 'verifying' })).toMatch(/Checking/)
    expect(progressLabel({ phase: 'preparing' })).toMatch(/Preparing/)
    expect(progressLabel({ phase: 'restarting' })).toMatch(/Restarting/)
  })
})

describe('downloadPercent', () => {
  it('rounds down and never passes 100', () => {
    expect(downloadPercent({ phase: 'downloading', receivedBytes: 999, totalBytes: 1000 })).toBe(99)
    expect(downloadPercent({ phase: 'downloading', receivedBytes: 1200, totalBytes: 1000 })).toBe(
      100
    )
    expect(downloadPercent({ phase: 'verifying' })).toBeNull()
  })
})

describe('checkResultMessage', () => {
  it('says what the check found, in words', () => {
    const update = {
      version: '0.3.1',
      releaseUrl: 'https://example.test',
      install: { canInstall: true as const }
    }
    expect(availableMessage(update)).toBe('Version 0.3.1 is available.')
    expect(checkResultMessage({ status: 'available', update })).toContain(
      'Version 0.3.1 is available.'
    )
    expect(checkResultMessage({ status: 'upToDate', currentVersion: '0.3.0' })).toBe(
      'You are up to date (version 0.3.0).'
    )
    expect(
      checkResultMessage({ status: 'error', error: { code: 'network', message: 'Offline.' } })
    ).toBe('Could not check for updates. Offline.')
  })
})

describe('isBannerVisible', () => {
  it('shows the banner when an update is pending and nothing holds it back', () => {
    expect(isBannerVisible({ hasPending: true, holds: 0, installing: false })).toBe(true)
    expect(isBannerVisible({ hasPending: false, holds: 0, installing: false })).toBe(false)
  })

  it('hides it during a Quiz round or a Design Exercise, and brings it back after', () => {
    expect(isBannerVisible({ hasPending: true, holds: 1, installing: false })).toBe(false)
    expect(isBannerVisible({ hasPending: true, holds: 2, installing: false })).toBe(false)
    expect(isBannerVisible({ hasPending: true, holds: 0, installing: false })).toBe(true)
  })

  it('keeps an install in progress visible', () => {
    expect(isBannerVisible({ hasPending: true, holds: 1, installing: true })).toBe(true)
  })
})

describe('menuCheckNotice', () => {
  const update = {
    version: '0.5.0',
    releaseUrl: 'https://example.test',
    install: { canInstall: true as const }
  }

  it('leaves an update found to the banner', () => {
    expect(menuCheckNotice({ status: 'available', update }, false)).toBeNull()
  })

  it('says the banner waits while a Round or a Design Exercise is open', () => {
    expect(menuCheckNotice({ status: 'available', update }, true)).toEqual({
      tone: 'info',
      transient: false,
      message:
        'Version 0.5.0 is available. The banner will offer it when you leave this Round or Design Exercise.'
    })
  })

  it('says the app is up to date, with its version', () => {
    expect(menuCheckNotice({ status: 'upToDate', currentVersion: '0.4.0' }, false)).toEqual({
      tone: 'info',
      transient: true,
      message: 'You are up to date (version 0.4.0).'
    })
  })

  it('shows a failed check as a readable error', () => {
    expect(
      menuCheckNotice({ status: 'error', error: { code: 'network', message: 'Offline.' } }, false)
    ).toEqual({ tone: 'error', transient: false, message: 'Could not check for updates. Offline.' })
  })
})
