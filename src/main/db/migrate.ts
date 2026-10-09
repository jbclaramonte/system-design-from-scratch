import type { Database } from './driver'

export interface Migration {
  /** Strictly increasing, never reused. */
  version: number
  name: string
  sql: string
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"

/** Highest applied migration version, 0 for a fresh database. */
export function schemaVersion(db: Database): number {
  ensureMigrationsTable(db)
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get<{
    version: number | null
  }>()
  return row?.version ?? 0
}

/**
 * Applies the pending migrations in order, each in its own transaction, and records them in
 * `schema_migrations`. Running it again is a no-op. Returns the resulting schema version.
 */
export function migrate(db: Database, migrations: readonly Migration[]): number {
  assertOrdered(migrations)
  const current = schemaVersion(db)
  const latest = migrations.at(-1)?.version ?? 0
  if (current > latest) {
    throw new Error(
      `Database schema version ${current} is newer than this app supports (${latest}).`
    )
  }

  const record = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES ($version, $name, ${NOW})`
  )
  for (const migration of migrations) {
    if (migration.version <= current) continue
    db.transaction(() => {
      db.exec(migration.sql)
      record.run({ version: migration.version, name: migration.name })
    })
  }
  return schemaVersion(db)
}

function ensureMigrationsTable(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`)
}

function assertOrdered(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const previous = migrations[index - 1]
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(`Invalid migration version ${migration.version} (${migration.name}).`)
    }
    if (previous && migration.version <= previous.version) {
      throw new Error(
        `Migrations must be strictly ordered: ${migration.version} follows ${previous.version}.`
      )
    }
  })
}
