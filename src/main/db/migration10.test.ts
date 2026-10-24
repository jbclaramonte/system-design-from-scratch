import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from './driver'
import { migrate } from './migrate'
import { migrations } from './migrations'
import { listBadgeUnlocks, markBadgeCelebrated, recordBadgeUnlocks } from './repositories/badges'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => db.close())

describe('migration 10 celebrated-badges', () => {
  it('adds the table without touching existing data', () => {
    migrate(db, migrations.slice(0, 9))
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('theme', '\"dark\"') ON CONFLICT (key) DO NOTHING"
    ).run()
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'celebrated_badges'").get()
    ).toBeUndefined()
    migrate(db, migrations)
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'celebrated_badges'").get()
    ).toBeDefined()
    expect(db.prepare("SELECT value FROM settings WHERE key = 'theme'").get()).toEqual({
      value: '"dark"'
    })
    expect(listBadgeUnlocks(db)).toEqual([])
  })

  it('records a Badge once, uncelebrated, then celebrates it once', () => {
    migrate(db, migrations)
    recordBadgeUnlocks(db, [{ badgeId: 'perfect-round', unlockedAt: '2026-10-20T10:00:00.000Z' }])
    recordBadgeUnlocks(db, [{ badgeId: 'perfect-round', unlockedAt: '2026-10-21T10:00:00.000Z' }])
    expect(listBadgeUnlocks(db)).toEqual([
      { badgeId: 'perfect-round', unlockedAt: '2026-10-20T10:00:00.000Z', celebrated: false }
    ])
    expect(markBadgeCelebrated(db, 'perfect-round')).toBe(true)
    expect(listBadgeUnlocks(db)[0]!.celebrated).toBe(true)
  })

  it('refuses an empty id and a celebrated flag other than 0 or 1', () => {
    migrate(db, migrations)
    expect(() =>
      db.prepare("INSERT INTO celebrated_badges (badge_id, unlocked_at) VALUES ('', 'x')").run()
    ).toThrow()
    expect(() =>
      db
        .prepare(
          "INSERT INTO celebrated_badges (badge_id, unlocked_at, celebrated) VALUES ('a', 'x', 2)"
        )
        .run()
    ).toThrow()
  })
})
