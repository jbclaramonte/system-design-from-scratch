import { existsSync } from 'node:fs'
import { openDatabase } from './driver'
import type { Migration } from './migrate'

/**
 * What to do with a database, given the schema version it holds and the highest one this app
 * knows. `current`: nothing to do. `migrate`: the app is newer, apply the pending migrations
 * (also a fresh database, version 0). `too_new`: the data was written by a newer app; an older
 * app never touches it.
 */
export type SchemaCompatibility = 'current' | 'migrate' | 'too_new'

export function schemaCompatibility(found: number, supported: number): SchemaCompatibility {
  if (found > supported) return 'too_new'
  return found === supported ? 'current' : 'migrate'
}

/** The database holds a schema version newer than this app supports. */
export class SchemaTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number
  ) {
    super(`Database schema version ${found} is newer than this app supports (${supported}).`)
    this.name = 'SchemaTooNewError'
  }
}

/** Highest migration version of the app, 0 when there is none. */
export function supportedSchemaVersion(migrations: readonly Migration[]): number {
  return migrations.at(-1)?.version ?? 0
}

/**
 * Schema version of the database file, read without changing anything: 0 when the file does not
 * exist (nothing is created) or has no migrations table. The file is opened read-only, before any
 * pragma or table creation of the normal open.
 */
export function peekSchemaVersion(path: string): number {
  if (!existsSync(path)) return 0
  // A WAL database that was closed cleanly has no `-wal` file and can be read as immutable, which
  // creates no file at all. With a `-wal` file the files exist already and are read as they are.
  const db = openDatabase(
    path,
    existsSync(`${path}-wal`) ? { readOnly: true } : { immutable: true }
  )
  try {
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get()
    if (!table) return 0
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get<{
      version: number | null
    }>()
    return row?.version ?? 0
  } finally {
    db.close()
  }
}
