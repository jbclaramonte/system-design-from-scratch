import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  peekSchemaVersion,
  schemaCompatibility,
  SchemaTooNewError,
  supportedSchemaVersion
} from './compatibility'
import { openDatabase } from './driver'
import { DATABASE_FILE_NAME, openAppDatabase } from './index'
import { migrate } from './migrate'
import { migrations } from './migrations'

const dirs: string[] = []

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sdfs-compat-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

/** Names and SHA-256 of every file of a folder: any write, creation or deletion changes it. */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(dir, name)))
          .digest('hex')
      ])
  )
}

/** A database file as a newer app would have left it: one more migration applied. */
function writeNewerDatabase(dir: string): number {
  const newer = supportedSchemaVersion(migrations) + 1
  const db = openDatabase(join(dir, DATABASE_FILE_NAME))
  migrate(db, [
    ...migrations,
    { version: newer, name: 'future', sql: 'CREATE TABLE future (x INT)' }
  ])
  db.close()
  return newer
}

describe('schemaCompatibility', () => {
  it('does nothing for the same version', () => {
    expect(schemaCompatibility(10, 10)).toBe('current')
  })

  it('migrates a database older than the app, and a fresh one', () => {
    expect(schemaCompatibility(9, 10)).toBe('migrate')
    expect(schemaCompatibility(0, 10)).toBe('migrate')
  })

  it('blocks a database newer than the app', () => {
    expect(schemaCompatibility(11, 10)).toBe('too_new')
  })
})

describe('peekSchemaVersion', () => {
  it('reads the version without creating or changing anything', () => {
    const dir = scratchDir()
    const path = join(dir, DATABASE_FILE_NAME)
    expect(peekSchemaVersion(path)).toBe(0)
    expect(readdirSync(dir)).toEqual([])

    const newer = writeNewerDatabase(dir)
    const before = snapshot(dir)
    expect(peekSchemaVersion(path)).toBe(newer)
    expect(snapshot(dir)).toEqual(before)
  })

  it('reads a folder name with spaces and a database another connection still has open', () => {
    const dir = join(scratchDir(), 'Application Support')
    mkdirSync(dir)
    const path = join(dir, DATABASE_FILE_NAME)
    const db = openDatabase(path)
    migrate(db, migrations)
    try {
      expect(existsSync(`${path}-wal`)).toBe(true)
      expect(peekSchemaVersion(path)).toBe(supportedSchemaVersion(migrations))
    } finally {
      db.close()
    }
    expect(peekSchemaVersion(path)).toBe(supportedSchemaVersion(migrations))
  })

  it('reads 0 from a file without a migrations table', () => {
    const dir = scratchDir()
    const path = join(dir, DATABASE_FILE_NAME)
    const db = openDatabase(path)
    db.exec('CREATE TABLE other (x INT)')
    db.close()
    const before = snapshot(dir)
    expect(peekSchemaVersion(path)).toBe(0)
    expect(snapshot(dir)).toEqual(before)
  })

  it('fails on a file that is not a database', () => {
    const dir = scratchDir()
    const path = join(dir, DATABASE_FILE_NAME)
    writeFileSync(path, 'this is not a database, and it is long enough to be read as a header')
    expect(() => peekSchemaVersion(path)).toThrow()
  })
})

describe('openAppDatabase with a database newer than the app', () => {
  it('refuses it and leaves every file of the folder as it was', () => {
    const dir = scratchDir()
    const newer = writeNewerDatabase(dir)
    const before = snapshot(dir)
    const supported = supportedSchemaVersion(migrations)

    let caught: unknown
    try {
      openAppDatabase(dir)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(SchemaTooNewError)
    expect(caught).toMatchObject({ found: newer, supported })
    expect(snapshot(dir)).toEqual(before)
  })

  it('creates the database of a fresh folder, and migrates an older one', () => {
    const dir = scratchDir()
    expect(existsSync(join(dir, DATABASE_FILE_NAME))).toBe(false)
    const fresh = openAppDatabase(dir)
    fresh.db.close()
    expect(fresh.schemaVersion).toBe(supportedSchemaVersion(migrations))

    const older = scratchDir()
    const db = openDatabase(join(older, DATABASE_FILE_NAME))
    migrate(db, migrations.slice(0, 5))
    db.close()
    const upgraded = openAppDatabase(older)
    upgraded.db.close()
    expect(upgraded.schemaVersion).toBe(supportedSchemaVersion(migrations))
  })
})
