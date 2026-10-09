import { join } from 'node:path'
import { openDatabase, type Database } from './driver'
import { migrate } from './migrate'
import { migrations } from './migrations'

export type { Database } from './driver'

export const DATABASE_FILE_NAME = 'system-design-from-scratch.db'

/** Opens the app database in `directory` (the userData dir) and applies pending migrations. */
export function openAppDatabase(directory: string): { db: Database; schemaVersion: number } {
  const db = openDatabase(join(directory, DATABASE_FILE_NAME))
  try {
    return { db, schemaVersion: migrate(db, migrations) }
  } catch (error) {
    db.close()
    throw error
  }
}
