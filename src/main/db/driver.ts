import { DatabaseSync } from 'node:sqlite'

/**
 * Thin interface over the SQLite driver, so the rest of the code (migrations, repositories,
 * tests) does not depend on a driver API. Backed by `node:sqlite`, which ships with the Node
 * embedded in Electron, so there is no native module to rebuild.
 */

export type SqlValue = null | number | bigint | string | Uint8Array
export type SqlParams = Record<string, SqlValue>
export type Row = Record<string, SqlValue>

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export interface Statement {
  run(params?: SqlParams): RunResult
  get<T = Row>(params?: SqlParams): T | undefined
  all<T = Row>(params?: SqlParams): T[]
}

export interface Database {
  exec(sql: string): void
  prepare(sql: string): Statement
  /** Runs `fn` in a transaction (rolled back if it throws). Nested calls join the outer one. */
  transaction<T>(fn: () => T): T
  close(): void
}

/** Opens (or creates) a database with WAL and foreign keys on. Use `:memory:` for tests. */
export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')

  const cache = new Map<string, Statement>()

  return {
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const cached = cache.get(sql)
      if (cached) return cached
      const statement = db.prepare(sql)
      const wrapped: Statement = {
        run: (params = {}) => {
          const result = statement.run(params)
          return {
            changes: Number(result.changes),
            lastInsertRowid: Number(result.lastInsertRowid)
          }
        },
        get: <T>(params: SqlParams = {}) => statement.get(params) as T | undefined,
        all: <T>(params: SqlParams = {}) => statement.all(params) as T[]
      }
      cache.set(sql, wrapped)
      return wrapped
    },
    transaction(fn) {
      if (db.isTransaction) return fn()
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = fn()
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close()
  }
}
