import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from './driver'
import { DATABASE_FILE_NAME, openAppDatabase } from './index'
import { migrate, schemaVersion, type Migration } from './migrate'
import { migrations } from './migrations'

const open: Database[] = []
const dirs: string[] = []

function memoryDb(): Database {
  const db = openDatabase(':memory:')
  open.push(db)
  return db
}

afterEach(() => {
  open.splice(0).forEach((db) => db.close())
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

describe('migrate', () => {
  it('applies every migration to a fresh database and records it', () => {
    const db = memoryDb()
    const latest = migrations.at(-1)!.version
    expect(migrate(db, migrations)).toBe(latest)
    const applied = db.prepare('SELECT version, name, applied_at FROM schema_migrations').all()
    expect(applied).toHaveLength(migrations.length)
    expect(applied[0]).toMatchObject({ version: 1, name: 'initial-schema' })
  })

  it('is idempotent', () => {
    const db = memoryDb()
    migrate(db, migrations)
    expect(migrate(db, migrations)).toBe(schemaVersion(db))
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({
      n: migrations.length
    })
  })

  it('applies only the pending migrations', () => {
    const db = memoryDb()
    const extra: Migration = { version: 1000, name: 'extra', sql: 'CREATE TABLE extra (x INT)' }
    migrate(db, migrations)
    expect(migrate(db, [...migrations, extra])).toBe(1000)
  })

  it('rolls back a failing migration entirely', () => {
    const db = memoryDb()
    const broken: Migration = {
      version: 1,
      name: 'broken',
      sql: 'CREATE TABLE ok (x INT); CREATE TABLE ok (x INT);'
    }
    expect(() => migrate(db, [broken])).toThrow()
    expect(schemaVersion(db)).toBe(0)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ok'").get()).toBeUndefined()
  })

  it('rejects unordered migrations', () => {
    const db = memoryDb()
    const a: Migration = { version: 2, name: 'a', sql: '' }
    const b: Migration = { version: 1, name: 'b', sql: '' }
    expect(() => migrate(db, [a, b])).toThrow(/strictly ordered/)
  })

  it('refuses a database newer than the app', () => {
    const db = memoryDb()
    migrate(db, [...migrations, { version: 1000, name: 'future', sql: '' }])
    expect(() => migrate(db, migrations)).toThrow(/newer/)
  })
})

describe('openAppDatabase', () => {
  it('creates a migrated database file in WAL mode with foreign keys on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdfs-db-'))
    dirs.push(dir)
    const { db, schemaVersion: version } = openAppDatabase(dir)
    open.push(db)
    expect(version).toBe(migrations.at(-1)!.version)
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    db.close()
    open.pop()

    const reopened = openAppDatabase(dir)
    open.push(reopened.db)
    expect(reopened.schemaVersion).toBe(version)
    expect(existsSync(join(dir, DATABASE_FILE_NAME))).toBe(true)
  })
})
