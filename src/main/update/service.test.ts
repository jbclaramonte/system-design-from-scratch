import { describe, expect, it, vi } from 'vitest'
import type { UpdateInfo, UpdateProgress } from '../../shared/update'
import type { LastUpdateCheck } from '../db/repositories/updateState'
import { UpdateError } from './errors'
import type { InstallCheck } from './installable'
import type { InstallPlan } from './installer'
import type { LatestRelease } from './release'
import { createUpdateService, type UpdateServiceDeps, type UpdateStore } from './service'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const HOUR = 60 * 60 * 1000

const release = (version = '0.3.1', macBuild = true): LatestRelease => ({
  version,
  tag: `v${version}`,
  releaseUrl: `https://github.com/o/r/releases/tag/v${version}`,
  macBuild: macBuild
    ? {
        dmgName: `app-${version}.dmg`,
        dmgUrl: `http://127.0.0.1:9/app-${version}.dmg`,
        checksumsUrl: 'http://127.0.0.1:9/SHA256SUMS'
      }
    : null
})

function memoryStore(initial: { last?: LastUpdateCheck; dismissed?: string } = {}) {
  const state = { last: initial.last ?? null, dismissed: initial.dismissed ?? null }
  const store: UpdateStore = {
    lastCheck: () => state.last,
    saveLastCheck: (check) => void (state.last = check),
    dismissedVersion: () => state.dismissed,
    saveDismissedVersion: (version) => void (state.dismissed = version)
  }
  return { state, store }
}

const installable: InstallCheck = {
  canInstall: true,
  bundlePath: '/Applications/App.app',
  executable: 'Contents/MacOS/App'
}

function setup(
  options: {
    latest?: LatestRelease | null | Error
    last?: LastUpdateCheck
    dismissed?: string
    enabled?: boolean
    allowed?: boolean
    installCheck?: InstallCheck
    installError?: Error
    currentVersion?: string
  } = {}
) {
  const { state, store } = memoryStore({ last: options.last, dismissed: options.dismissed })
  const notified: UpdateInfo[] = []
  const installed: InstallPlan[] = []
  const lookup = vi.fn(async () => {
    const latest = options.latest === undefined ? release() : options.latest
    if (latest instanceof Error) throw latest
    return latest
  })
  const scheduleQuit = vi.fn()
  const log = vi.fn()
  const deps: UpdateServiceDeps = {
    currentVersion: options.currentVersion ?? '0.3.0',
    store,
    checkAtLaunchEnabled: () => options.enabled ?? true,
    launchCheckAllowed: options.allowed ?? true,
    lookup,
    checkInstallable: async () => options.installCheck ?? installable,
    install: async (plan) => {
      if (options.installError) throw options.installError
      installed.push(plan)
    },
    notify: (update) => notified.push(update),
    scheduleQuit,
    now: () => NOW,
    log
  }
  return {
    service: createUpdateService(deps),
    state,
    notified,
    installed,
    lookup,
    scheduleQuit,
    log
  }
}

describe('check (the button)', () => {
  it('reports a newer release and announces it', async () => {
    const { service, notified, state } = setup()
    const result = await service.check()

    const update: UpdateInfo = {
      version: '0.3.1',
      releaseUrl: 'https://github.com/o/r/releases/tag/v0.3.1',
      install: { canInstall: true }
    }
    expect(result).toEqual({ status: 'available', update })
    expect(notified).toEqual([update])
    expect(service.pending()).toEqual(update)
    expect(state.last).toEqual({
      checkedAt: new Date(NOW).toISOString(),
      latest: { version: '0.3.1', releaseUrl: update.releaseUrl, hasMacBuild: true }
    })
  })

  it('says it is up to date for an equal or an older release', async () => {
    for (const latest of [release('0.3.0'), release('0.2.9'), null]) {
      const { service, notified } = setup({ latest })
      expect(await service.check()).toEqual({ status: 'upToDate', currentVersion: '0.3.0' })
      expect(service.pending()).toBeNull()
      expect(notified).toEqual([])
    }
  })

  it('never offers a pre-release version', async () => {
    const { service } = setup({ latest: release('0.4.0-beta.1') })
    expect(await service.check()).toMatchObject({ status: 'upToDate' })
  })

  it('shows a dismissed version again, because the learner asked', async () => {
    const { service, state, notified } = setup({ dismissed: '0.3.1' })
    expect(await service.check()).toMatchObject({ status: 'available' })
    expect(state.dismissed).toBeNull()
    expect(notified).toHaveLength(1)
  })

  it('turns a network error into a readable result, never a rejection', async () => {
    const { service, state } = setup({
      latest: new UpdateError(
        'network',
        'Could not reach GitHub. Check your connection and try again.'
      )
    })
    expect(await service.check()).toEqual({
      status: 'error',
      error: {
        code: 'network',
        message: 'Could not reach GitHub. Check your connection and try again.'
      }
    })
    // A failed check does not count as a check made.
    expect(state.last).toBeNull()
  })

  it('explains in the update itself why it cannot be installed', async () => {
    const reason = 'The app installs updates by itself on macOS with Apple Silicon only.'
    const { service } = setup({ installCheck: { canInstall: false, reason } })
    expect(await service.check()).toMatchObject({
      status: 'available',
      update: { install: { canInstall: false, reason } }
    })
    const { service: withoutBuild } = setup({ latest: release('0.3.1', false) })
    expect(await withoutBuild.check()).toMatchObject({
      update: { install: { canInstall: false } }
    })
  })
})

describe('dismiss', () => {
  it('remembers the version, which is then not announced at launch', async () => {
    const { service, state, notified } = setup()
    await service.check()
    service.dismiss('0.3.1')
    expect(service.pending()).toBeNull()
    expect(state.dismissed).toBe('0.3.1')

    const next = setup({ dismissed: state.dismissed ?? undefined })
    await next.service.checkAtLaunch()
    expect(next.notified).toEqual([])
    expect(next.service.pending()).toBeNull()
    expect(notified).toHaveLength(1)
  })

  it('announces a newer version than the dismissed one', async () => {
    const { service, notified } = setup({ dismissed: '0.3.1', latest: release('0.3.2') })
    await service.checkAtLaunch()
    expect(notified.map((update) => update.version)).toEqual(['0.3.2'])
  })
})

describe('checkAtLaunch', () => {
  it('checks and announces a newer release', async () => {
    const { service, notified, lookup } = setup()
    await service.checkAtLaunch()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(notified.map((update) => update.version)).toEqual(['0.3.1'])
    expect(service.pending()?.version).toBe('0.3.1')
  })

  it('does nothing when the setting is off', async () => {
    const { service, lookup, notified } = setup({ enabled: false })
    await service.checkAtLaunch()
    expect(lookup).not.toHaveBeenCalled()
    expect(notified).toEqual([])
    // The button still works.
    expect(await service.check()).toMatchObject({ status: 'available' })
  })

  it('does nothing in a build that must not reach the network on its own', async () => {
    const { service, lookup } = setup({ allowed: false })
    await service.checkAtLaunch()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('asks GitHub once a day at most', async () => {
    const found = { version: '0.3.1', releaseUrl: 'https://example.test/r', hasMacBuild: true }
    const recent: LastUpdateCheck = {
      checkedAt: new Date(NOW - 23 * HOUR).toISOString(),
      latest: found
    }
    const { service, lookup, notified } = setup({ last: recent })
    await service.checkAtLaunch()
    expect(lookup).not.toHaveBeenCalled()
    // An update found at the last check is announced again without a request.
    expect(notified.map((update) => update.version)).toEqual(['0.3.1'])

    const stale: LastUpdateCheck = { ...recent, checkedAt: new Date(NOW - 25 * HOUR).toISOString() }
    const next = setup({ last: stale })
    await next.service.checkAtLaunch()
    expect(next.lookup).toHaveBeenCalledTimes(1)
  })

  it('does not announce a cached version the app has since been updated to', async () => {
    const last: LastUpdateCheck = {
      checkedAt: new Date(NOW - HOUR).toISOString(),
      latest: { version: '0.3.1', releaseUrl: 'https://example.test/r', hasMacBuild: true }
    }
    const { service, notified } = setup({ last, currentVersion: '0.3.1' })
    await service.checkAtLaunch()
    expect(notified).toEqual([])
  })

  it('stays silent and never throws on a network error', async () => {
    const { service, notified, log } = setup({ latest: new UpdateError('network', 'offline') })
    await expect(service.checkAtLaunch()).resolves.toBeUndefined()
    expect(notified).toEqual([])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('offline'))
  })
})

describe('install', () => {
  const noProgress: (progress: UpdateProgress) => void = () => {}

  it('installs the announced version, then schedules the quit', async () => {
    const { service, installed, scheduleQuit } = setup()
    await service.check()
    expect(await service.install('0.3.1', noProgress)).toEqual({ ok: true })
    expect(installed).toEqual([
      {
        version: '0.3.1',
        build: release().macBuild,
        bundlePath: '/Applications/App.app',
        executable: 'Contents/MacOS/App'
      }
    ])
    expect(scheduleQuit).toHaveBeenCalledTimes(1)
  })

  it('refuses a second install while one is under way or done', async () => {
    const { service, installed } = setup()
    await service.install('0.3.1', noProgress)
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      ok: false,
      error: { code: 'busy' }
    })
    expect(installed).toHaveLength(1)
  })

  it('refuses when the app cannot install itself, with the reason and the manual link', async () => {
    const { service, installed, lookup, scheduleQuit } = setup({
      installCheck: {
        canInstall: false,
        reason: 'This is a development build, not a packaged app.'
      }
    })
    const result = await service.install('0.3.1', noProgress)
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'not_installable',
        message: 'This is a development build, not a packaged app.'
      },
      manualUrl: 'https://github.com/jbclaramonte/system-design-from-scratch/releases/tag/v0.3.1'
    })
    expect(installed).toEqual([])
    expect(lookup).not.toHaveBeenCalled()
    expect(scheduleQuit).not.toHaveBeenCalled()
  })

  it('refuses a release without the macOS build', async () => {
    const { service, installed } = setup({ latest: release('0.3.1', false) })
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      ok: false,
      error: { code: 'no_asset' },
      manualUrl: expect.stringContaining('v0.3.1')
    })
    expect(installed).toEqual([])
  })

  it('refuses when the latest release is not the version the learner saw', async () => {
    const { service, installed } = setup({ latest: release('0.3.2') })
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      ok: false,
      error: { code: 'stale' }
    })
    expect(installed).toEqual([])
  })

  it('reports a failed step with the manual link, keeps the app running and allows a retry', async () => {
    const { service, scheduleQuit, installed } = setup({
      installError: new UpdateError('checksum', 'The downloaded file is corrupt.')
    })
    expect(await service.install('0.3.1', noProgress)).toEqual({
      ok: false,
      error: { code: 'checksum', message: 'The downloaded file is corrupt.' },
      manualUrl: 'https://github.com/o/r/releases/tag/v0.3.1'
    })
    expect(scheduleQuit).not.toHaveBeenCalled()
    expect(installed).toEqual([])
    // Not stuck "busy".
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      error: { code: 'checksum' }
    })
  })

  it('reports an unexpected error in words', async () => {
    const { service } = setup({ installError: new Error('boom') })
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      ok: false,
      error: { code: 'unknown', message: expect.stringContaining('boom') }
    })
  })

  it('reports a network failure of the lookup before installing', async () => {
    const { service } = setup({ latest: new UpdateError('network', 'offline') })
    expect(await service.install('0.3.1', noProgress)).toMatchObject({
      ok: false,
      error: { code: 'network', message: 'offline' }
    })
  })
})
