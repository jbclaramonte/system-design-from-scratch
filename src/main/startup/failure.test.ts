import { describe, expect, it, vi } from 'vitest'
import { SchemaTooNewError } from '../db/compatibility'
import {
  describeStartupFailure,
  NO_DIALOG_ENV,
  RELEASES_URL,
  reportStartupFailure,
  type StartupFailureDeps
} from './failure'

function fakeDeps(response = 0, env: StartupFailureDeps['env'] = {}) {
  return {
    showMessageBox: vi.fn<StartupFailureDeps['showMessageBox']>(async () => ({ response })),
    openExternal: vi.fn<StartupFailureDeps['openExternal']>(async () => undefined),
    exit: vi.fn<StartupFailureDeps['exit']>(),
    log: vi.fn<StartupFailureDeps['log']>(),
    env
  }
}

const tooNew = new SchemaTooNewError(10, 9)

describe('describeStartupFailure', () => {
  it('tells in plain language that the data is newer, that nothing changed and to update', () => {
    const { dialog, opensReleases } = describeStartupFailure(tooNew, '/data')
    expect(opensReleases).toBe(true)
    expect(dialog.message).toBe('Your data was created by a newer version of the app.')
    expect(dialog.detail).toContain('Nothing was changed.')
    expect(dialog.detail).toContain('Update the app')
    expect(dialog.detail).toContain('format 10')
    expect(dialog.detail).toContain('up to 9')
    expect(dialog.buttons).toEqual(['Open the Releases page', 'Quit'])
  })

  it('shows the message and the data folder of any other error', () => {
    const { dialog, opensReleases } = describeStartupFailure(
      new Error('unable to open database file'),
      '/data/folder'
    )
    expect(opensReleases).toBe(false)
    expect(dialog.detail).toBe('unable to open database file\n\nData folder: /data/folder')
    expect(dialog.buttons).toEqual(['Quit'])
    expect(describeStartupFailure('boom', '/d').dialog.detail).toContain('boom')
  })
})

describe('reportStartupFailure', () => {
  it('shows the dialog, opens the Releases page on the first button, then exits with 1', async () => {
    const deps = fakeDeps(0)
    await reportStartupFailure(tooNew, '/data', deps)
    expect(deps.showMessageBox).toHaveBeenCalledTimes(1)
    expect(deps.showMessageBox.mock.calls[0]?.[0]).toMatchObject({
      type: 'error',
      buttons: ['Open the Releases page', 'Quit'],
      defaultId: 0,
      cancelId: 1
    })
    expect(deps.openExternal).toHaveBeenCalledWith(RELEASES_URL)
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('only exits when the learner quits', async () => {
    const deps = fakeDeps(1)
    await reportStartupFailure(tooNew, '/data', deps)
    expect(deps.openExternal).not.toHaveBeenCalled()
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('never offers the Releases page for another error', async () => {
    const deps = fakeDeps(0)
    await reportStartupFailure(new Error('migration 11 failed'), '/data', deps)
    expect(deps.openExternal).not.toHaveBeenCalled()
    expect(deps.showMessageBox.mock.calls[0]?.[0]).toMatchObject({ buttons: ['Quit'] })
    expect(deps.log.mock.calls[0]?.[0]).toContain('migration 11 failed')
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('logs the text, opens no dialog and exits when the dialog is turned off', async () => {
    const deps = fakeDeps(0, { [NO_DIALOG_ENV]: '1' })
    await reportStartupFailure(tooNew, '/data', deps)
    expect(deps.showMessageBox).not.toHaveBeenCalled()
    expect(deps.openExternal).not.toHaveBeenCalled()
    expect(deps.log.mock.calls[0]?.[0]).toContain('newer version of the app')
    expect(deps.log.mock.calls[0]?.[0]).toContain('Nothing was changed')
    expect(deps.exit).toHaveBeenCalledWith(1)
  })

  it('still exits when the dialog or the browser fails', async () => {
    const deps = fakeDeps(0)
    deps.showMessageBox.mockRejectedValueOnce(new Error('no display'))
    await reportStartupFailure(tooNew, '/data', deps)
    expect(deps.exit).toHaveBeenCalledWith(1)

    const second = fakeDeps(0)
    second.openExternal.mockRejectedValueOnce(new Error('no browser'))
    await reportStartupFailure(tooNew, '/data', second)
    expect(second.exit).toHaveBeenCalledWith(1)
  })
})
