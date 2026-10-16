import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../driver'
import { migrate } from '../migrate'
import { migrations } from '../migrations'
import { getSettings } from './settings'
import {
  getDismissedUpdateVersion,
  getLastUpdateCheck,
  saveDismissedUpdateVersion,
  saveLastUpdateCheck
} from './updateState'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

describe('update state', () => {
  it('is empty before the first check, with no migration', () => {
    expect(getLastUpdateCheck(db)).toBeNull()
    expect(getDismissedUpdateVersion(db)).toBeNull()
  })

  it('remembers the last check and the dismissed version', () => {
    const check = {
      checkedAt: '2026-10-16T10:00:00.000Z',
      latest: {
        version: '0.3.1',
        releaseUrl: 'https://example.test/r',
        hasMacBuild: true,
        hasAppImage: false
      }
    }
    saveLastUpdateCheck(db, check)
    saveDismissedUpdateVersion(db, '0.3.1')
    expect(getLastUpdateCheck(db)).toEqual(check)
    expect(getDismissedUpdateVersion(db)).toBe('0.3.1')

    saveLastUpdateCheck(db, { checkedAt: '2026-10-17T10:00:00.000Z', latest: null })
    saveDismissedUpdateVersion(db, null)
    expect(getLastUpdateCheck(db)).toEqual({ checkedAt: '2026-10-17T10:00:00.000Z', latest: null })
    expect(getDismissedUpdateVersion(db)).toBeNull()
  })

  it('reads a check saved before the Linux install existed as carrying the AppImage', () => {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('update_last_check', '{"checkedAt":"2026-10-16T10:00:00.000Z","latest":{"version":"0.3.1","releaseUrl":"https://example.test/r","hasMacBuild":true}}')`
    ).run()
    expect(getLastUpdateCheck(db)?.latest).toEqual({
      version: '0.3.1',
      releaseUrl: 'https://example.test/r',
      hasMacBuild: true,
      hasAppImage: true
    })
  })

  it('ignores a row of the wrong shape', () => {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('update_last_check', '{"x":1}')`).run()
    db.prepare("INSERT INTO settings (key, value) VALUES ('update_dismissed_version', '42')").run()
    expect(getLastUpdateCheck(db)).toBeNull()
    expect(getDismissedUpdateVersion(db)).toBeNull()
  })

  it('stays out of the Settings screen values', () => {
    saveDismissedUpdateVersion(db, '0.3.1')
    expect(Object.keys(getSettings(db))).not.toContain('update_dismissed_version')
    expect(getSettings(db).checkForUpdatesAtLaunch).toBe(true)
  })
})
