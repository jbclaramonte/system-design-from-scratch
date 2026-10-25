import { join } from 'node:path'
import {
  peekSchemaVersion,
  schemaCompatibility,
  SchemaTooNewError,
  supportedSchemaVersion
} from './compatibility'
import { openDatabase, type Database } from './driver'
import { migrate } from './migrate'
import { migrations } from './migrations'

export type { Database } from './driver'
export { SchemaTooNewError } from './compatibility'

export const DATABASE_FILE_NAME = 'system-design-from-scratch.db'

/**
 * Opens the app database in `directory` (the userData dir) and applies pending migrations. A
 * database written by a newer app is refused before it is opened for writing: the file is only
 * read (`SchemaTooNewError`).
 */
export function openAppDatabase(directory: string): { db: Database; schemaVersion: number } {
  const path = join(directory, DATABASE_FILE_NAME)
  const supported = supportedSchemaVersion(migrations)
  const found = peekSchemaVersion(path)
  if (schemaCompatibility(found, supported) === 'too_new') {
    throw new SchemaTooNewError(found, supported)
  }
  const db = openDatabase(path)
  try {
    return { db, schemaVersion: migrate(db, migrations) }
  } catch (error) {
    db.close()
    throw error
  }
}
